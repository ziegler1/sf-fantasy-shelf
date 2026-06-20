import { Router, Request, Response, NextFunction } from 'express';
import pool from '../db';
import { asyncHandler } from '../lib/asyncHandler';

const INTERNAL_KEY = process.env.CODEX_INTERNAL_KEY;

function requireInternalKey(req: Request, res: Response, next: NextFunction): void {
  if (!INTERNAL_KEY || req.headers['x-internal-key'] !== INTERNAL_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

const BOOKS_QUERY = `
SELECT
  b.id,
  b.title,
  a.name AS author,
  s.name AS series,
  ub.status,
  ub.rating
FROM user_books ub
JOIN books b ON b.id = ub.book_id
LEFT JOIN book_authors ba ON ba.book_id = b.id
LEFT JOIN authors a ON a.id = ba.author_id
LEFT JOIN book_series bs ON bs.book_id = b.id
LEFT JOIN series s ON s.id = bs.series_id
ORDER BY ub.created_at DESC
`;

const router = Router();

router.get('/books', requireInternalKey, asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(BOOKS_QUERY);
  res.json({ books: rows });
}));

router.get('/books/recent', requireInternalKey, asyncHandler(async (_req, res) => {
  const { rows } = await pool.query(BOOKS_QUERY + '\nLIMIT 10');
  res.json({ books: rows });
}));

export default router;
