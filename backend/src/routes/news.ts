import { Router } from 'express';
import pool from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { verifyToken } from '../middleware/auth';
import { fetchNewsFeeds, FEEDS } from '../lib/fetchNewsFeeds';

const router = Router();
router.use(verifyToken);

// Seed all known sources as enabled for a user if they have no rows yet
async function seedSourcesForUser(userId: number): Promise<void> {
  await pool.query(
    `INSERT INTO user_feed_sources (user_id, source_name, enabled)
     SELECT $1, unnest($2::text[]), true
     ON CONFLICT (user_id, source_name) DO NOTHING`,
    [userId, FEEDS.map(f => f.name)],
  );
}

// ── GET /api/news ─────────────────────────────────────────────────────────────

router.get('/', asyncHandler(async (req, res) => {
  const userId = req.userId;
  const limit  = Math.min(Number(req.query['limit']  ?? 30), 100);
  const offset = Math.max(Number(req.query['offset'] ?? 0),  0);

  await seedSourcesForUser(userId);

  const [{ rows }, { rows: countRows }] = await Promise.all([
    pool.query(
      `SELECT na.id, na.source_name, na.title, na.url, na.description, na.image_url,
              na.published_at, na.created_at
       FROM news_articles na
       WHERE na.source_name IN (
         SELECT source_name FROM user_feed_sources WHERE user_id = $1 AND enabled = true
       )
       AND na.id NOT IN (
         SELECT article_id FROM user_dismissed_articles WHERE user_id = $1
       )
       ORDER BY na.published_at DESC NULLS LAST, na.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*) FROM news_articles na
       WHERE na.source_name IN (
         SELECT source_name FROM user_feed_sources WHERE user_id = $1 AND enabled = true
       )
       AND na.id NOT IN (
         SELECT article_id FROM user_dismissed_articles WHERE user_id = $1
       )`,
      [userId],
    ),
  ]);

  res.json({ articles: rows, total: Number(countRows[0]!.count) });
}));

// ── DELETE /api/news/:id ──────────────────────────────────────────────────────

router.delete('/:id', asyncHandler(async (req, res) => {
  const articleId = Number(req.params['id']);
  const userId    = req.userId;

  const exists = await pool.query('SELECT id FROM news_articles WHERE id = $1', [articleId]);
  if (!exists.rowCount) return res.status(404).json({ error: 'Not found' });

  await pool.query(
    `INSERT INTO user_dismissed_articles (user_id, article_id)
     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [userId, articleId],
  );
  res.status(204).send();
}));

// ── GET /api/news/sources ─────────────────────────────────────────────────────

router.get('/sources', asyncHandler(async (req, res) => {
  const userId = req.userId;
  await seedSourcesForUser(userId);

  const { rows } = await pool.query<{ source_name: string; enabled: boolean }>(
    `SELECT source_name, enabled FROM user_feed_sources WHERE user_id = $1 ORDER BY id`,
    [userId],
  );

  // Return in FEEDS order with category, merging DB enabled state
  const enabledMap = new Map(rows.map(r => [r.source_name, r.enabled]));
  const sources = FEEDS.map(f => ({
    name:     f.name,
    category: f.category,
    enabled:  enabledMap.get(f.name) ?? true,
  }));

  res.json(sources);
}));

// ── PUT /api/news/sources/:name ───────────────────────────────────────────────

router.put('/sources/:name', asyncHandler(async (req, res) => {
  const userId = req.userId;
  const name   = decodeURIComponent(req.params['name'] ?? '');
  const { enabled } = req.body as { enabled: boolean };

  if (typeof enabled !== 'boolean') {
    return res.status(400).json({ error: 'enabled must be a boolean' });
  }

  if (!FEEDS.some(f => f.name === name)) {
    return res.status(404).json({ error: 'Unknown source' });
  }

  await pool.query(
    `INSERT INTO user_feed_sources (user_id, source_name, enabled)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, source_name) DO UPDATE SET enabled = EXCLUDED.enabled`,
    [userId, name, enabled],
  );

  res.json({ name, enabled });
}));

// ── POST /api/news/refresh ────────────────────────────────────────────────────

router.post('/refresh', asyncHandler(async (req, res) => {
  const results = await fetchNewsFeeds();
  const total = await pool.query<{ count: string }>('SELECT COUNT(*) FROM news_articles');
  res.json({ results, total: Number(total.rows[0].count) });
}));

export default router;
