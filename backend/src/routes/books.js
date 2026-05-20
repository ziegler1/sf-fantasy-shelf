const { Router } = require('express');
const { Pool } = require('pg');

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

router.get('/', async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM books ORDER BY created_at DESC');
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM books WHERE id = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

router.post('/', async (req, res) => {
  const { title, author, genre, status } = req.body;
  const { rows } = await pool.query(
    'INSERT INTO books (title, author, genre, status) VALUES ($1, $2, $3, $4) RETURNING *',
    [title, author, genre, status]
  );
  res.status(201).json(rows[0]);
});

router.put('/:id', async (req, res) => {
  const { title, author, genre, status } = req.body;
  const { rows } = await pool.query(
    'UPDATE books SET title=$1, author=$2, genre=$3, status=$4 WHERE id=$5 RETURNING *',
    [title, author, genre, status, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  const result = await pool.query('DELETE FROM books WHERE id = $1', [req.params.id]);
  if (!result.rowCount) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});

module.exports = router;
