import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface JwtPayload {
  userId: number;
  email: string;
}

// Extend Express Request so routes can read req.userId
declare global {
  namespace Express {
    interface Request {
      userId: number;
    }
  }
}

export function verifyToken(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers['authorization'];
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing token' });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, jwtSecret()) as JwtPayload;
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function jwtSecret(): string {
  const secret = process.env['JWT_SECRET'];
  if (!secret) throw new Error('JWT_SECRET env var is not set');
  return secret;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, jwtSecret(), { expiresIn: '30d' });
}
