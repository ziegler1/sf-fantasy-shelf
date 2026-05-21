import { Router } from 'express';
import bcrypt from 'bcrypt';
import pool from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { signToken, verifyToken } from '../middleware/auth';

const router = Router();
const BCRYPT_ROUNDS = 12;

// ── POST /api/auth/register ───────────────────────────────────────────────────

router.post('/register', asyncHandler(async (req, res) => {
  const { email, name, password } = req.body as {
    email?: string; name?: string; password?: string;
  };

  if (!email || !name || !password) {
    return res.status(400).json({ error: 'email, name, and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

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

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

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

// ── POST /api/auth/change-password ───────────────────────────────────────────

router.post('/change-password', verifyToken, asyncHandler(async (req, res) => {
  const { current_password, new_password } = req.body as {
    current_password?: string;
    new_password?: string;
  };

  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'current_password and new_password are required' });
  }
  if (new_password.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

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
