import { readFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });

async function run() {
  const client = await pool.connect();
  try {
    // Track which migrations have run
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name       TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const migrations = ['001_init.sql', '002_full_schema.sql', '003_add_users.sql', '004_add_ai_summary.sql', '005_upcoming_user_id.sql', '006_upcoming_description.sql', '007_google_books_id.sql'];

    for (const name of migrations) {
      const { rows } = await client.query(
        'SELECT 1 FROM _migrations WHERE name = $1', [name]
      );
      if (rows.length) {
        console.log(`  skip  ${name}`);
        continue;
      }

      console.log(`  apply ${name}`);
      const sql = readFileSync(join(__dirname, '../db', name), 'utf8');
      await client.query(sql);
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [name]);
      console.log(`  done  ${name}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
