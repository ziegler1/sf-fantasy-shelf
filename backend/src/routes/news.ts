import { Router } from 'express';
import pool from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { verifyToken } from '../middleware/auth';
import { fetchNewsFeeds } from '../lib/fetchNewsFeeds';

const router = Router();
router.use(verifyToken);


router.get('/', asyncHandler(async (req, res) => {
  const limit  = Math.min(Number(req.query['limit']  ?? 30), 100);
  const offset = Math.max(Number(req.query['offset'] ?? 0),  0);

  const [{ rows }, { rows: countRows }] = await Promise.all([
    pool.query(
      `SELECT id, source_name, title, url, description, image_url, published_at, created_at
       FROM news_articles
       WHERE dismissed = false
       ORDER BY published_at DESC NULLS LAST, created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM news_articles WHERE dismissed = false`,
    ),
  ]);

  res.json({ articles: rows, total: Number(countRows[0]!.count) });
}));

// ── DELETE /api/news/:id ──────────────────────────────────────────────────────

router.delete('/:id', asyncHandler(async (req, res) => {
  const result = await pool.query(
    'UPDATE news_articles SET dismissed = true WHERE id = $1',
    [req.params['id']],
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
}));

// Manual refresh — triggers an immediate fetch and returns per-source results
router.post('/refresh', asyncHandler(async (req, res) => {
  const results = await fetchNewsFeeds();
  const total = await pool.query<{ count: string }>('SELECT COUNT(*) FROM news_articles');
  res.json({ results, total: Number(total.rows[0].count) });
}));

export default router;
