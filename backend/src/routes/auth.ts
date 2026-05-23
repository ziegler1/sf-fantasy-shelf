import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import pool from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { signToken, verifyToken } from '../middleware/auth';
import { validate, requiredStr, nullableStr } from '../lib/validate';

const registerSchema = z.object({
  email:    z.string().email().max(255).trim(),
  name:     requiredStr(100),
  password: z.string().min(8).max(128),
});

const loginSchema = z.object({
  email:    z.string().email().trim(),
  password: z.string().min(1),
});

const profileSchema = z.object({
  name:  requiredStr(100).optional(),
  email: z.string().email().max(255).trim().optional(),
}).refine(d => d.name !== undefined || d.email !== undefined, {
  message: 'Provide name and/or email to update',
});

const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password:     z.string().min(8).max(128),
});

const router = Router();
const BCRYPT_ROUNDS = 12;

// ── POST /api/auth/register ───────────────────────────────────────────────────

router.post('/register', validate(registerSchema), asyncHandler(async (req, res) => {
  const { email, name, password } = req.body as z.infer<typeof registerSchema>;

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // If the seed user (id=1, password_hash='') exists and no real users have
  // registered yet, update it so existing shelf data transfers automatically.
  const seed = await pool.query(
    `SELECT id FROM users WHERE password_hash = '' LIMIT 1`,
  );

  let userId: number;

  if (seed.rows.length) {
    // First real registration — claim the seed row
    try {
      const { rows } = await pool.query(
        `UPDATE users SET email=$1, name=$2, password_hash=$3 WHERE id=$4 RETURNING id`,
        [email.toLowerCase(), name, hash, seed.rows[0].id],
      );
      userId = rows[0].id;
    } catch (err: unknown) {
      if ((err as { code?: string }).code === '23505') {
        return res.status(409).json({ error: 'Email already registered' });
      }
      throw err;
    }
  } else {
    // Subsequent registrations — insert a new user
    try {
      const { rows } = await pool.query(
        `INSERT INTO users (email, name, password_hash) VALUES ($1,$2,$3) RETURNING id`,
        [email.toLowerCase(), name, hash],
      );
      userId = rows[0].id;
    } catch (err: unknown) {
      if ((err as { code?: string }).code === '23505') {
        return res.status(409).json({ error: 'Email already registered' });
      }
      throw err;
    }
  }

  const token = signToken({ userId, email: email.toLowerCase() });
  res.status(201).json({ token, user: { id: userId, email: email.toLowerCase(), name } });
}));

// ── POST /api/auth/login ──────────────────────────────────────────────────────

router.post('/login', validate(loginSchema), asyncHandler(async (req, res) => {
  const { email, password } = req.body as z.infer<typeof loginSchema>;

  const { rows } = await pool.query(
    `SELECT id, email, name, password_hash FROM users WHERE email = $1`,
    [email.toLowerCase()],
  );

  if (!rows.length || !rows[0].password_hash) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const valid = await bcrypt.compare(password, rows[0].password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const user = rows[0];
  const token = signToken({ userId: user.id, email: user.email });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
}));

// ── GET /api/auth/me ──────────────────────────────────────────────────────────

router.get('/me', verifyToken, asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, email, name, created_at FROM users WHERE id = $1`,
    [req.userId],
  );
  if (!rows.length) return res.status(404).json({ error: 'User not found' });
  res.json(rows[0]);
}));

// ── PUT /api/auth/profile ─────────────────────────────────────────────────────

router.put('/profile', verifyToken, validate(profileSchema), asyncHandler(async (req, res) => {
  const { name, email } = req.body as z.infer<typeof profileSchema>;

  const current = await pool.query(
    'SELECT name, email FROM users WHERE id = $1', [req.userId],
  );
  if (!current.rows.length) return res.status(404).json({ error: 'User not found' });

  const newName  = name  ?? current.rows[0].name;
  const newEmail = email ?? current.rows[0].email;

  try {
    const { rows } = await pool.query(
      `UPDATE users SET name=$1, email=$2 WHERE id=$3
       RETURNING id, name, email, created_at`,
      [newName, newEmail, req.userId],
    );
    res.json(rows[0]);
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') {
      return res.status(409).json({ error: 'Email already in use' });
    }
    throw err;
  }
}));

// ── POST /api/auth/change-password ───────────────────────────────────────────

router.post('/change-password', verifyToken, validate(changePasswordSchema), asyncHandler(async (req, res) => {
  const { current_password, new_password } = req.body as z.infer<typeof changePasswordSchema>;

  const { rows } = await pool.query(
    'SELECT password_hash FROM users WHERE id = $1', [req.userId],
  );
  if (!rows.length) return res.status(404).json({ error: 'User not found' });

  const valid = await bcrypt.compare(current_password, rows[0].password_hash);
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

  const hash = await bcrypt.hash(new_password, BCRYPT_ROUNDS);
  await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, req.userId]);

  res.json({ message: 'Password updated successfully' });
}));

export default router;
