import { Router } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { z } from 'zod';
import pool from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import jwt from 'jsonwebtoken';
import { signToken, verifyToken, jwtSecret } from '../middleware/auth';
import { validate, requiredStr } from '../lib/validate';
import { sendApprovalRequest, sendPasswordReset, sendWelcome } from '../lib/email';

const registerSchema = z.object({
  email:       z.string().email().max(255).trim(),
  name:        requiredStr(100),
  password:    z.string().min(8).max(128),
  inviteCode:  z.string().min(1),
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

const forgotPasswordSchema = z.object({
  email: z.string().email().trim(),
});

const resetPasswordSchema = z.object({
  token:    z.string().min(1),
  password: z.string().min(8).max(128),
});

const router = Router();
const BCRYPT_ROUNDS = 12;

function inviteCode(): string {
  const code = process.env['INVITE_CODE'];
  if (!code) throw new Error('INVITE_CODE env var is not set');
  return code;
}

// ── POST /api/auth/register ───────────────────────────────────────────────────

router.post('/register', validate(registerSchema), asyncHandler(async (req, res) => {
  const { email, name, password, inviteCode: submitted } = req.body as z.infer<typeof registerSchema>;

  if (submitted !== inviteCode()) {
    return res.status(403).json({ error: 'Invalid invite code' });
  }

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // If the seed user (id=1, password_hash='') exists, the first registrant
  // claims it and gets immediate access (that's the admin/owner).
  const seed = await pool.query(`SELECT id FROM users WHERE password_hash = '' LIMIT 1`);

  let userId: number;
  let isFirstUser = false;

  if (seed.rows.length) {
    try {
      const { rows } = await pool.query(
        `UPDATE users SET email=$1, name=$2, password_hash=$3, status='active' WHERE id=$4 RETURNING id`,
        [email.toLowerCase(), name, hash, seed.rows[0].id],
      );
      userId = rows[0].id;
      isFirstUser = true;
    } catch (err: unknown) {
      if ((err as { code?: string }).code === '23505') {
        return res.status(409).json({ error: 'Email already registered' });
      }
      throw err;
    }
  } else {
    try {
      const { rows } = await pool.query(
        `INSERT INTO users (email, name, password_hash, status) VALUES ($1,$2,$3,'pending') RETURNING id`,
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

  if (!isFirstUser) {
    // Send approval request to admin; token lets them approve via email link
    try {
      const approveToken = signToken({ userId, email: email.toLowerCase() });
      await sendApprovalRequest(userId, name, email.toLowerCase(), approveToken);
    } catch (err) {
      console.error('[auth] failed to send approval email:', err);
    }
    return res.status(201).json({ pending: true });
  }

  const token = signToken({ userId, email: email.toLowerCase() });
  res.status(201).json({ token, user: { id: userId, email: email.toLowerCase(), name } });
}));

// ── POST /api/auth/login ──────────────────────────────────────────────────────

router.post('/login', validate(loginSchema), asyncHandler(async (req, res) => {
  const { email, password } = req.body as z.infer<typeof loginSchema>;

  const { rows } = await pool.query(
    `SELECT id, email, name, password_hash, status FROM users WHERE email = $1`,
    [email.toLowerCase()],
  );

  if (!rows.length || !rows[0].password_hash) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const valid = await bcrypt.compare(password, rows[0].password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

  if (rows[0].status === 'pending') {
    return res.status(403).json({ error: 'Your account is pending approval. You\'ll be notified by email once approved.' });
  }

  const user = rows[0];
  const token = signToken({ userId: user.id, email: user.email });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name } });
}));

// ── GET /api/auth/approve ─────────────────────────────────────────────────────
// Called by admin clicking the link in the approval email

router.get('/approve', asyncHandler(async (req, res) => {
  const { token } = req.query as { token?: string };
  const appUrl = process.env['APP_URL'] ?? 'http://localhost:4200';

  if (!token) return res.redirect(`${appUrl}/login?approved=error`);

  let payload: { userId: number; email: string };
  try {
    payload = jwt.verify(token, jwtSecret()) as { userId: number; email: string };
  } catch {
    return res.redirect(`${appUrl}/login?approved=error`);
  }

  const { rows } = await pool.query(
    `UPDATE users SET status='active' WHERE id=$1 AND status='pending' RETURNING id, name, email`,
    [payload.userId],
  );

  if (!rows.length) {
    // Already approved or doesn't exist — still redirect gracefully
    return res.redirect(`${appUrl}/login?approved=already`);
  }

  try {
    await sendWelcome(rows[0].name, rows[0].email);
  } catch (err) {
    console.error('[auth] failed to send welcome email:', err);
  }

  res.redirect(`${appUrl}/login?approved=1`);
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

  const current = await pool.query('SELECT name, email FROM users WHERE id = $1', [req.userId]);
  if (!current.rows.length) return res.status(404).json({ error: 'User not found' });

  const newName  = name  ?? current.rows[0].name;
  const newEmail = email ?? current.rows[0].email;

  try {
    const { rows } = await pool.query(
      `UPDATE users SET name=$1, email=$2 WHERE id=$3 RETURNING id, name, email, created_at`,
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

  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.userId]);
  if (!rows.length) return res.status(404).json({ error: 'User not found' });

  const valid = await bcrypt.compare(current_password, rows[0].password_hash);
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

  const hash = await bcrypt.hash(new_password, BCRYPT_ROUNDS);
  await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, req.userId]);

  res.json({ message: 'Password updated successfully' });
}));

// ── POST /api/auth/forgot-password ───────────────────────────────────────────

router.post('/forgot-password', validate(forgotPasswordSchema), asyncHandler(async (req, res) => {
  const { email } = req.body as z.infer<typeof forgotPasswordSchema>;

  const { rows } = await pool.query(
    `SELECT id, name FROM users WHERE email = $1 AND status = 'active'`,
    [email.toLowerCase()],
  );

  // Always return 200 — don't reveal whether the email exists
  if (rows.length) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token, expires_at)
       VALUES ($1, $2, $3)`,
      [rows[0].id, token, expiresAt],
    );

    try {
      await sendPasswordReset(rows[0].name, email.toLowerCase(), token);
    } catch (err) {
      console.error('[auth] failed to send reset email:', err);
    }
  }

  res.json({ message: 'If that email has an account, a reset link has been sent.' });
}));

// ── POST /api/auth/reset-password ────────────────────────────────────────────

router.post('/reset-password', validate(resetPasswordSchema), asyncHandler(async (req, res) => {
  const { token, password } = req.body as z.infer<typeof resetPasswordSchema>;

  const { rows } = await pool.query(
    `SELECT prt.id, prt.user_id FROM password_reset_tokens prt
     WHERE prt.token = $1
       AND prt.used = false
       AND prt.expires_at > NOW()`,
    [token],
  );

  if (!rows.length) {
    return res.status(400).json({ error: 'Reset link is invalid or has expired.' });
  }

  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await Promise.all([
    pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [hash, rows[0].user_id]),
    pool.query('UPDATE password_reset_tokens SET used=true WHERE id=$1', [rows[0].id]),
  ]);

  res.json({ message: 'Password reset successfully. You can now sign in.' });
}));

export default router;
