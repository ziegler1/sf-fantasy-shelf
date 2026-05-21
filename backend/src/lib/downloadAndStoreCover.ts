import pool from '../db';
import { uploadCover } from './r2';

export async function downloadAndStoreCover(bookId: number, coverUrl: string): Promise<void> {
  // Skip silently if R2 credentials are not configured
  if (!process.env['R2_ACCOUNT_ID'] || !process.env['R2_ACCESS_KEY_ID'] || !process.env['R2_PUBLIC_URL']) return;

  // Skip if the cover is already stored in R2
  if (coverUrl.startsWith(process.env['R2_PUBLIC_URL'])) return;

  const response = await fetch(coverUrl);
  if (!response.ok) throw new Error(`Failed to fetch cover: ${response.status}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type') ?? 'image/jpeg';

  const { url } = await uploadCover(buffer, 'cover.jpg', contentType);
  await pool.query('UPDATE books SET cover_url = $1 WHERE id = $2', [url, bookId]);
}
