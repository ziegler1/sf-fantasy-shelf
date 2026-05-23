import { Router } from 'express';
import pool from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { verifyToken } from '../middleware/auth';
import { fetchNewsFeeds } from '../lib/fetchNewsFeeds';

const router = Router();
router.use(verifyToken);

router.get('/debug', asyncHandler(async (req, res) => {
  const tests: Record<string, unknown> = {};
  try {
    const r1 = await pool.query("SELECT to_regclass('public.news_articles') AS tbl");
    tests['table_exists'] = r1.rows[0].tbl;
  } catch (e) { tests['table_check_error'] = String(e); }
  try {
    const r2 = await pool.query('SELECT COUNT(*) FROM news_articles');
    tests['row_count'] = r2.rows[0].count;
  } catch (e) { tests['count_error'] = String(e); }
  try {
    const r3 = await pool.query(
      'SELECT id FROM news_articles ORDER BY published_at DESC NULLS LAST, created_at DESC LIMIT 1',
    );
    tests['order_ok'] = r3.rows.length >= 0;
  } catch (e) { tests['order_error'] = String(e); }
  res.json(tests);
}));

router.get('/', asyncHandler(async (req, res) => {
  const limit  = Math.min(Number(req.query['limit']  ?? 60), 100);
  const offset = Math.max(Number(req.query['offset'] ?? 0),  0);

  try {
    const { rows } = await pool.query(
      `SELECT id, source_name, title, url, description, image_url, published_at, created_at
       FROM news_articles
       ORDER BY published_at DESC NULLS LAST, created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    res.json(rows);
  } catch (err) {
    console.error('[news] GET / error:', err);
    throw err;
  }
}));

// Manual refresh — triggers an immediate fetch and returns per-source results
router.post('/refresh', asyncHandler(async (req, res) => {
  const results = await fetchNewsFeeds();
  const total = await pool.query<{ count: string }>('SELECT COUNT(*) FROM news_articles');
  res.json({ results, total: Number(total.rows[0].count) });
}));

export default router;
