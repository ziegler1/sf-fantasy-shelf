import { Router } from 'express';
import { z } from 'zod';
import pool from '../db';
import { asyncHandler } from '../lib/asyncHandler';
import { verifyToken } from '../middleware/auth';
import { validate, requiredStr, nullableStr, readingStatus } from '../lib/validate';
import { generateAndStoreSummary } from '../lib/generateSummary';
import { downloadAndStoreCover, retryCoverForBook } from '../lib/downloadAndStoreCover';
import { populateSeriesBooks } from '../lib/populateSeriesBooks';
import type { BookWithDetails, ReadingStatus } from '../types';

const importSchema = z.object({
  title:           requiredStr(500),
  authors:         z.array(z.string()).optional().default([]),
  cover_url:       nullableStr(2048),
  published_at:    nullableStr(30),
  page_count:      z.number().int().positive().nullable().optional(),
  isbn:            nullableStr(20),
  isbn13:          nullableStr(20),
  description:     nullableStr(20000),
  language:        z.string().max(10).optional().default('en'),
  status:          readingStatus.optional(),
  series_name:     nullableStr(500),
  series_position: z.number().nullable().optional(),
  google_id:       nullableStr(100),
  categories:      z.array(z.string()).optional().default([]),
  tags:            z.array(z.string()).optional().default([]),
  rating:          z.number().min(1).max(5).nullable().optional(),
});

const bookCreateSchema = z.object({
  title:        requiredStr(500),
  isbn:         nullableStr(20),
  isbn13:       nullableStr(20),
  description:  nullableStr(20000),
  cover_url:    nullableStr(2048),
  published_at: nullableStr(20),
  page_count:   z.number().int().positive().nullable().optional(),
  language:     z.string().max(10).optional(),
  author_ids:   z.array(z.object({ author_id: z.number(), role: z.string().optional() })).optional(),
  tag_ids:      z.array(z.number()).optional(),
  series:       z.array(z.object({ series_id: z.number(), position: z.number().nullable().optional() })).optional(),
});

const bookUpdateSchema = z.object({
  title:        requiredStr(500),
  isbn:         nullableStr(20),
  isbn13:       nullableStr(20),
  description:  nullableStr(20000),
  cover_url:    nullableStr(2048),
  published_at: nullableStr(30),
  page_count:   z.number().int().positive().nullable().optional(),
  language:     z.string().max(10).optional(),
});

const shelfUpdateSchema = z.object({
  status:      readingStatus.optional(),
  rating:      z.number().min(1).max(5).nullable().optional(),
  review:      nullableStr(10000),
  notes:       nullableStr(5000),
  started_at:  z.string().nullable().optional(),
  finished_at: z.string().nullable().optional(),
});

const bookAuthorsSchema = z.object({
  authors: z.array(z.string().min(1).max(255)).max(20),
});

const bookTagsSchema = z.object({
  tags: z.array(z.string().min(1).max(100)).max(30),
});

const router = Router();

// All book routes require authentication
router.use(verifyToken);

// ── Helpers ───────────────────────────────────────────────────────────────────

// PostgreSQL DATE requires YYYY-MM-DD. OpenLibrary only provides a year ("1965").
function toDateValue(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  if (/^\d{4}$/.test(t))       return `${t}-01-01`;
  if (/^\d{4}-\d{2}$/.test(t)) return `${t}-01`;
  return t;
}

// ── Enriched query helper ─────────────────────────────────────────────────────
// userId is appended as the last parameter so existing $1/$2 WHERE refs don't shift.

function booksQuery(userId: number, where = '', extraValues: unknown[] = [], limit?: number, offset?: number) {
  const values = [...extraValues, userId];
  const userParam = `$${values.length}`;

  let pagination = '';
  if (limit !== undefined) {
    values.push(limit);
    pagination += ` LIMIT $${values.length}`;
  }
  if (offset !== undefined && offset > 0) {
    values.push(offset);
    pagination += ` OFFSET $${values.length}`;
  }

  return {
    text: `
      SELECT
        b.*,
        COALESCE(
          jsonb_agg(DISTINCT jsonb_build_object(
            'id', a.id, 'name', a.name, 'bio', a.bio,
            'website', a.website, 'image_url', a.image_url,
            'created_at', a.created_at, 'updated_at', a.updated_at,
            'role', ba.role
          )) FILTER (WHERE a.id IS NOT NULL), '[]'
        ) AS authors,
        COALESCE(
          jsonb_agg(DISTINCT jsonb_build_object(
            'id', s.id, 'name', s.name, 'description', s.description,
            'created_at', s.created_at, 'updated_at', s.updated_at,
            'position', bs.position
          )) FILTER (WHERE s.id IS NOT NULL), '[]'
        ) AS series,
        COALESCE(
          jsonb_agg(DISTINCT jsonb_build_object(
            'id', t.id, 'name', t.name, 'created_at', t.created_at
          )) FILTER (WHERE t.id IS NOT NULL), '[]'
        ) AS tags,
        CASE WHEN ub.id IS NOT NULL THEN jsonb_build_object(
          'id', ub.id, 'book_id', ub.book_id, 'status', ub.status,
          'rating', ub.rating, 'review', ub.review, 'notes', ub.notes,
          'started_at', ub.started_at, 'finished_at', ub.finished_at,
          'featured', ub.featured,
          'created_at', ub.created_at, 'updated_at', ub.updated_at
        ) ELSE NULL END AS user_book
      FROM books b
      LEFT JOIN book_authors ba ON ba.book_id = b.id
      LEFT JOIN authors a       ON a.id = ba.author_id
      LEFT JOIN book_series bs  ON bs.book_id = b.id
      LEFT JOIN series s        ON s.id = bs.series_id
      LEFT JOIN book_tags bt    ON bt.book_id = b.id
      LEFT JOIN tags t          ON t.id = bt.tag_id
      LEFT JOIN user_books ub   ON ub.book_id = b.id AND ub.user_id = ${userParam}
      ${where}
      GROUP BY b.id, ub.id
      ORDER BY b.title${pagination}
    `,
    values,
  };
}

// ── POST /api/books/import  (Google Books → DB, author lookup-or-create) ──────

router.post('/import', validate(importSchema), asyncHandler(async (req, res) => {
  const {
    title, authors: authorNames, cover_url, published_at,
    page_count, isbn, isbn13, description, language,
    status, series_name, series_position, google_id, categories, tags, rating,
  } = req.body as z.infer<typeof importSchema>;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // If a book with the same ISBN already exists, reuse it — but still wire up
    // the series link, add to shelf, and trigger series population.
    if (isbn13 || isbn) {
      const existing = await client.query<{ id: number }>(
        `SELECT id FROM books WHERE (isbn13 = $1 AND isbn13 IS NOT NULL)
                                 OR (isbn = $2 AND isbn IS NOT NULL) LIMIT 1`,
        [isbn13 ?? null, isbn ?? null],
      );
      if (existing.rows.length) {
        const existingId = existing.rows[0].id;

        if (series_name?.trim()) {
          const trimmedSeries = series_name.trim();
          const sf = await client.query<{ id: number }>(
            `SELECT id FROM series WHERE REGEXP_REPLACE(LOWER(name), '^the\\s+', '') = REGEXP_REPLACE(LOWER($1), '^the\\s+', '') LIMIT 1`,
            [trimmedSeries],
          );
          let seriesId: number;
          if (sf.rows.length) {
            seriesId = sf.rows[0].id;
          } else {
            const { rows: [s] } = await client.query<{ id: number }>(
              'INSERT INTO series (name) VALUES ($1) RETURNING id', [trimmedSeries],
            );
            seriesId = s.id;
          }
          await client.query(
            'INSERT INTO book_series (book_id, series_id, position) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
            [existingId, seriesId, series_position ?? null],
          );
        }

        await client.query(
          `INSERT INTO user_books (user_id, book_id, status, rating) VALUES ($1,$2,$3,$4)
           ON CONFLICT (user_id, book_id) DO UPDATE SET status = EXCLUDED.status, rating = COALESCE(EXCLUDED.rating, user_books.rating), updated_at = NOW()`,
          [req.userId, existingId, status || 'want-to-read', rating ?? null],
        );

        for (const raw of tags) {
          const name = raw.trim().slice(0, 100);
          if (!name) continue;
          const { rows: [tag] } = await client.query<{ id: number }>(
            `INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
            [name],
          );
          await client.query(
            'INSERT INTO book_tags (book_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
            [existingId, tag.id],
          );
        }

        await client.query('COMMIT');

        const { rows } = await pool.query<BookWithDetails>(
          booksQuery(req.userId, 'WHERE b.id = $1', [existingId]),
        );
        res.status(200).json(rows[0]);

        if (series_name?.trim()) {
          const capturedSeriesName = series_name.trim();
          const { rows: bookRows } = await pool.query<{ google_books_id: string | null }>(
            'SELECT google_books_id FROM books WHERE id = $1', [existingId],
          );
          const capturedGoogleBooksId = bookRows[0]?.google_books_id ?? null;
          pool.query<{ id: number }>(
            `SELECT id FROM series WHERE REGEXP_REPLACE(LOWER(name), '^the\\s+', '') = REGEXP_REPLACE(LOWER($1), '^the\\s+', '') LIMIT 1`,
            [capturedSeriesName],
          ).then(({ rows: sr }) => {
            if (!sr.length) return;
            return populateSeriesBooks(sr[0].id, capturedSeriesName, capturedGoogleBooksId);
          }).catch(err => console.error(`Series population failed for "${series_name}":`, err));
        }

        return;
      }
    }

    // Insert the book
    const { rows: [book] } = await client.query(
      `INSERT INTO books (title, isbn, isbn13, description, cover_url, published_at, page_count, language, google_books_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [title, isbn ?? null, isbn13 ?? null, description ?? null,
       cover_url ?? null, toDateValue(published_at), page_count ?? null, language,
       google_id ?? null],
    );

    // Lookup-or-create each author — normalise by stripping all non-alphanumeric
    // chars so "C.S. Friedman" and "C. S. Friedman" resolve to the same record.
    for (const name of authorNames) {
      const trimmed = name.trim();
      if (!trimmed) continue;
      let authorId: number;
      const found = await client.query<{ id: number }>(
        `SELECT id FROM authors
         WHERE LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]', '', 'g'))
             = LOWER(REGEXP_REPLACE($1,   '[^a-zA-Z0-9]', '', 'g'))
         LIMIT 1`,
        [trimmed],
      );
      if (found.rows.length) {
        authorId = found.rows[0].id;
      } else {
        const { rows: [a] } = await client.query<{ id: number }>(
          'INSERT INTO authors (name) VALUES ($1) RETURNING id', [trimmed],
        );
        authorId = a.id;
      }
      await client.query(
        'INSERT INTO book_authors (book_id, author_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [book.id, authorId, 'author'],
      );
    }

    // Find-or-create series and link to book.
    // Normalise by stripping a leading "The " so "The Wheel of Time" and
    // "Wheel of Time" resolve to the same series record.
    if (series_name?.trim()) {
      const trimmed = series_name.trim();
      let seriesId: number;
      const found = await client.query<{ id: number }>(
        `SELECT id FROM series
         WHERE REGEXP_REPLACE(LOWER(name), '^the\\s+', '') = REGEXP_REPLACE(LOWER($1), '^the\\s+', '')
         LIMIT 1`,
        [trimmed],
      );
      if (found.rows.length) {
        seriesId = found.rows[0].id;
      } else {
        const { rows: [s] } = await client.query<{ id: number }>(
          'INSERT INTO series (name) VALUES ($1) RETURNING id', [trimmed],
        );
        seriesId = s.id;
      }
      await client.query(
        `INSERT INTO book_series (book_id, series_id, position)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [book.id, seriesId, series_position ?? null],
      );
    }

    // Auto-assign tags from Google Books categories
    for (const raw of categories) {
      const name = raw.trim().slice(0, 100);
      if (!name) continue;
      const { rows: [tag] } = await client.query<{ id: number }>(
        `INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [name],
      );
      await client.query(
        'INSERT INTO book_tags (book_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [book.id, tag.id],
      );
    }

    // Apply user-specified tags (in addition to categories from Google Books)
    for (const raw of tags) {
      const name = raw.trim().slice(0, 100);
      if (!name) continue;
      const { rows: [tag] } = await client.query<{ id: number }>(
        `INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [name],
      );
      await client.query(
        'INSERT INTO book_tags (book_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [book.id, tag.id],
      );
    }

    // Always add to the user's shelf — default want-to-read if no status chosen
    await client.query(
      `INSERT INTO user_books (user_id, book_id, status, rating) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, book_id) DO UPDATE SET status = EXCLUDED.status, rating = COALESCE(EXCLUDED.rating, user_books.rating), updated_at = NOW()`,
      [req.userId, book.id, status || 'want-to-read', rating ?? null],
    );

    await client.query('COMMIT');

    const { rows } = await pool.query<BookWithDetails>(
      booksQuery(req.userId, 'WHERE b.id = $1', [book.id]),
    );
    res.status(201).json(rows[0]);

    // Capture values needed by background jobs before client is released
    const importedBookId   = book.id;
    const importedCoverUrl = book.cover_url as string | null;

    const importedUserId = req.userId;
    setImmediate(() => {
      generateAndStoreSummary(importedBookId, importedUserId).catch(err =>
        console.error(`Summary generation failed for book ${importedBookId}:`, err),
      );
      if (importedCoverUrl) {
        downloadAndStoreCover(importedBookId, importedCoverUrl).catch(err =>
          console.error(`Cover upload failed for book ${importedBookId}:`, err),
        );
      }
    });

    // Populate other books in the series in the background
    if (series_name?.trim()) {
      const capturedSeriesName  = series_name.trim();
      const capturedGoogleBooksId = book.google_books_id as string | null;
      // Look up the series ID — use the same normalised match as the find-or-create
      // so "The Wheel of Time" finds an existing "Wheel of Time" record correctly.
      pool.query<{ id: number }>(
        `SELECT id FROM series WHERE REGEXP_REPLACE(LOWER(name), '^the\\s+', '') = REGEXP_REPLACE(LOWER($1), '^the\\s+', '') LIMIT 1`,
        [capturedSeriesName],
      ).then(({ rows: sr }) => {
        if (!sr.length) return;
        return populateSeriesBooks(sr[0].id, capturedSeriesName, capturedGoogleBooksId);
      }).catch(err =>
        console.error(`Series population failed for "${series_name}":`, err),
      );
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// ── GET /api/books/export ────────────────────────────────────────────────────

router.get('/export', asyncHandler(async (req, res) => {
  const { rows } = await pool.query<BookWithDetails>(
    booksQuery(req.userId, 'WHERE ub.id IS NOT NULL'),
  );

  const payload = {
    exported_at:  new Date().toISOString(),
    version:      1,
    book_count:   rows.length,
    books: rows.map(b => ({
      title:        b.title,
      isbn13:       b.isbn13,
      isbn:         b.isbn,
      published_at: b.published_at,
      page_count:   b.page_count,
      language:     b.language,
      description:  b.description,
      cover_url:    b.cover_url,
      authors:      b.authors.map((a: { name: string; role: string }) => ({ name: a.name, role: a.role })),
      tags:         b.tags.map((t: { name: string }) => t.name),
      series:       b.series.map((s: { name: string; position: number | null }) => ({ name: s.name, position: s.position })),
      status:       b.user_book?.status ?? null,
      rating:       b.user_book?.rating ?? null,
      review:       b.user_book?.review ?? null,
      notes:        b.user_book?.notes ?? null,
      started_at:   b.user_book?.started_at ?? null,
      finished_at:  b.user_book?.finished_at ?? null,
    })),
  };

  const filename = `sf-fantasy-shelf-${new Date().toISOString().slice(0, 10)}.json`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.json(payload);
}));

// ── GET /api/books  (?status=reading&search=dune&limit=50&offset=0) ──────────

router.get('/', asyncHandler(async (req, res) => {
  // Only show books that are on the user's shelf — auto-populated series
  // siblings have no user_books entry and must not appear in the library.
  const conditions: string[] = ['ub.id IS NOT NULL'];
  const values: unknown[] = [];

  if (req.query['status']) {
    values.push(req.query['status']);
    conditions.push(`ub.status = $${values.length}`);
  }
  if (req.query['search']) {
    const escaped = String(req.query['search']).replace(/[%_\\]/g, '\\$&');
    values.push(`%${escaped}%`);
    const p = `$${values.length}`;
    conditions.push(`(b.title ILIKE ${p} ESCAPE '\\' OR EXISTS (
      SELECT 1 FROM book_authors ba2
      JOIN authors a2 ON a2.id = ba2.author_id
      WHERE ba2.book_id = b.id AND a2.name ILIKE ${p} ESCAPE '\\'
    ))`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const limit = req.query['limit'] === 'all'
    ? undefined
    : (() => {
        const n = parseInt(String(req.query['limit'] || '50'), 10);
        return isNaN(n) ? 50 : Math.min(Math.max(n, 1), 200);
      })();
  const offset = Math.max(parseInt(String(req.query['offset'] || '0'), 10), 0);

  const [booksResult, countResult] = await Promise.all([
    pool.query<BookWithDetails>(booksQuery(req.userId, where, values, limit, offset)),
    pool.query<{ count: string }>(
      `SELECT COUNT(DISTINCT b.id) AS count
       FROM books b
       LEFT JOIN user_books ub ON ub.book_id = b.id AND ub.user_id = $${values.length + 1}
       ${where}`,
      [...values, req.userId],
    ),
  ]);

  res.json({ books: booksResult.rows, total: parseInt(countResult.rows[0].count, 10) });
}));

// ── GET /api/books/:id ────────────────────────────────────────────────────────

router.get('/:id', asyncHandler(async (req, res) => {
  const { rows } = await pool.query<BookWithDetails>(
    booksQuery(req.userId, 'WHERE b.id = $1', [req.params['id']]),
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
}));

// ── POST /api/books ───────────────────────────────────────────────────────────

router.post('/', validate(bookCreateSchema), asyncHandler(async (req, res) => {
  const { title, isbn, isbn13, description, cover_url, published_at,
          page_count, language, author_ids, tag_ids, series: seriesLinks } = req.body as z.infer<typeof bookCreateSchema>;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO books (title, isbn, isbn13, description, cover_url,
                          published_at, page_count, language)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [title, isbn ?? null, isbn13 ?? null, description ?? null,
       cover_url ?? null, toDateValue(published_at), page_count ?? null,
       language ?? 'en'],
    );
    const book = rows[0];

    if (Array.isArray(author_ids)) {
      for (const { author_id, role = 'author' } of author_ids) {
        await client.query(
          'INSERT INTO book_authors (book_id, author_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
          [book.id, author_id, role],
        );
      }
    }
    if (Array.isArray(tag_ids)) {
      for (const tag_id of tag_ids) {
        await client.query(
          'INSERT INTO book_tags (book_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [book.id, tag_id],
        );
      }
    }
    if (Array.isArray(seriesLinks)) {
      for (const { series_id, position = null } of seriesLinks) {
        await client.query(
          'INSERT INTO book_series (book_id, series_id, position) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
          [book.id, series_id, position],
        );
      }
    }

    await client.query('COMMIT');
    res.status(201).json(book);

    setImmediate(() => {
      generateAndStoreSummary(book.id, req.userId).catch(err =>
        console.error(`Summary generation failed for book ${book.id}:`, err),
      );
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// ── PUT /api/books/:id ────────────────────────────────────────────────────────

router.put('/:id', validate(bookUpdateSchema), asyncHandler(async (req, res) => {
  const { title, isbn, isbn13, description, cover_url,
          published_at, page_count, language } = req.body as z.infer<typeof bookUpdateSchema>;

  const owns = await pool.query(
    'SELECT 1 FROM user_books WHERE user_id = $1 AND book_id = $2',
    [req.userId, req.params['id']],
  );
  if (!owns.rows.length) return res.status(403).json({ error: 'Not authorized' });

  const { rows } = await pool.query(
    `UPDATE books
     SET title=$1, isbn=$2, isbn13=$3, description=$4, cover_url=$5,
         published_at=$6, page_count=$7, language=$8, updated_at=NOW()
     WHERE id=$9 RETURNING *`,
    [title, isbn ?? null, isbn13 ?? null, description ?? null,
     cover_url ?? null, toDateValue(published_at), page_count ?? null,
     language ?? 'en', req.params['id']],
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);

  // If a new external cover URL was saved, upload it to R2 in the background
  const savedBook = rows[0] as { id: number; cover_url: string | null };
  const r2Base = process.env['R2_PUBLIC_URL'];
  if (cover_url && r2Base && !cover_url.startsWith(r2Base)) {
    setImmediate(() => {
      downloadAndStoreCover(savedBook.id, cover_url).catch(err =>
        console.error(`[cover] upload failed for book ${savedBook.id}:`, err),
      );
    });
  }
}));

// ── DELETE /api/books/:id ─────────────────────────────────────────────────────

router.delete('/:id', asyncHandler(async (req, res) => {
  const owns = await pool.query(
    'SELECT 1 FROM user_books WHERE user_id = $1 AND book_id = $2',
    [req.userId, req.params['id']],
  );
  if (!owns.rows.length) return res.status(403).json({ error: 'Not authorized' });

  const result = await pool.query('DELETE FROM books WHERE id=$1', [req.params['id']]);
  if (!result.rowCount) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
}));

// ── PUT /api/books/:id/authors ────────────────────────────────────────────────

router.put('/:id/authors', validate(bookAuthorsSchema), asyncHandler(async (req, res) => {
  const { authors } = req.body as z.infer<typeof bookAuthorsSchema>;
  const bookId = Number(req.params['id']);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM book_authors WHERE book_id = $1', [bookId]);

    for (const name of authors) {
      const trimmed = name.trim();
      if (!trimmed) continue;
      const found = await client.query<{ id: number }>(
        `SELECT id FROM authors
         WHERE LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]', '', 'g'))
             = LOWER(REGEXP_REPLACE($1,   '[^a-zA-Z0-9]', '', 'g'))
         LIMIT 1`,
        [trimmed],
      );
      let authorId: number;
      if (found.rows.length) {
        authorId = found.rows[0].id;
      } else {
        const { rows: [a] } = await client.query<{ id: number }>(
          'INSERT INTO authors (name) VALUES ($1) RETURNING id', [trimmed],
        );
        authorId = a.id;
      }
      await client.query(
        'INSERT INTO book_authors (book_id, author_id, role) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [bookId, authorId, 'author'],
      );
    }

    await client.query('COMMIT');

    const { rows } = await pool.query(
      `SELECT a.id, a.name, a.bio, a.website, a.image_url, a.created_at, a.updated_at, ba.role
       FROM authors a
       JOIN book_authors ba ON ba.author_id = a.id
       WHERE ba.book_id = $1
       ORDER BY a.name`,
      [bookId],
    );
    res.json(rows);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// ── POST /api/books/:id/retry-cover ──────────────────────────────────────────

router.post('/:id/retry-cover', asyncHandler(async (req, res) => {
  const bookId = Number(req.params['id']);
  const { rows } = await pool.query<{ id: number }>(
    'SELECT id FROM books WHERE id = $1', [bookId],
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });

  const finalUrl = await retryCoverForBook(bookId);
  res.json({ cover_url: finalUrl });
}));

// ── PUT /api/books/:id/tags ───────────────────────────────────────────────────

router.put('/:id/tags', validate(bookTagsSchema), asyncHandler(async (req, res) => {
  const { tags } = req.body as z.infer<typeof bookTagsSchema>;
  const bookId = Number(req.params['id']);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM book_tags WHERE book_id = $1', [bookId]);

    for (const raw of tags) {
      const name = raw.trim();
      if (!name) continue;
      const { rows: [tag] } = await client.query<{ id: number }>(
        `INSERT INTO tags (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [name],
      );
      await client.query(
        'INSERT INTO book_tags (book_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [bookId, tag.id],
      );
    }

    await client.query('COMMIT');

    const { rows } = await pool.query(
      `SELECT t.id, t.name, t.created_at FROM tags t
       JOIN book_tags bt ON bt.tag_id = t.id
       WHERE bt.book_id = $1 ORDER BY t.name`,
      [bookId],
    );
    res.json(rows);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// ── PUT /api/books/:id/feature ───────────────────────────────────────────────
// Pins this book as the featured "now reading" book; unpins all others for the user.
// Calling again on the already-featured book unpins it.

router.put('/:id/feature', asyncHandler(async (req, res) => {
  const bookId = Number(req.params['id']);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<{ featured: boolean }>(
      'SELECT featured FROM user_books WHERE user_id = $1 AND book_id = $2',
      [req.userId, bookId],
    );
    const alreadyFeatured = rows[0]?.featured ?? false;

    // Unfeature all books for this user first
    await client.query(
      'UPDATE user_books SET featured = false WHERE user_id = $1',
      [req.userId],
    );
    // If it wasn't already featured, feature it now (toggle off if it was)
    if (!alreadyFeatured) {
      await client.query(
        'UPDATE user_books SET featured = true WHERE user_id = $1 AND book_id = $2',
        [req.userId, bookId],
      );
    }
    await client.query('COMMIT');
    res.json({ featured: !alreadyFeatured });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// ── PUT /api/books/:id/shelf ──────────────────────────────────────────────────

router.put('/:id/shelf', validate(shelfUpdateSchema), asyncHandler(async (req, res) => {
  const { status, rating, review, notes, started_at, finished_at } = req.body as z.infer<typeof shelfUpdateSchema>;

  const { rows } = await pool.query(
    `INSERT INTO user_books (user_id, book_id, status, rating, review, notes, started_at, finished_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (user_id, book_id) DO UPDATE SET
       status      = EXCLUDED.status,
       rating      = EXCLUDED.rating,
       review      = EXCLUDED.review,
       notes       = EXCLUDED.notes,
       started_at  = EXCLUDED.started_at,
       finished_at = EXCLUDED.finished_at,
       updated_at  = NOW()
     RETURNING *`,
    [req.userId, req.params['id'], status ?? 'want-to-read', rating ?? null,
     review ?? null, notes ?? null, started_at ?? null, finished_at ?? null],
  );
  res.json(rows[0]);
}));

// ── DELETE /api/books/:id/shelf ───────────────────────────────────────────────

router.delete('/:id/shelf', asyncHandler(async (req, res) => {
  await pool.query(
    'DELETE FROM user_books WHERE user_id=$1 AND book_id=$2',
    [req.userId, req.params['id']],
  );
  res.status(204).send();
}));

export default router;
