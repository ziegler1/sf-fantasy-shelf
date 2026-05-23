import { Router } from 'express';
import pool from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { verifyToken } from '../middleware/auth';

const router = Router();
router.use(verifyToken);

router.get('/', asyncHandler(async (req, res) => {
  const limit  = Math.min(Number(req.query['limit']  ?? 60), 100);
  const offset = Math.max(Number(req.query['offset'] ?? 0),  0);

  const { rows } = await pool.query(
    `SELECT id, source_name, title, url, description, image_url, published_at, created_at
     FROM news_articles
     ORDER BY COALESCE(published_at, created_at) DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  res.json(rows);
}));

export default router;
