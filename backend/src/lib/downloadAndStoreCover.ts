import pool from '../db';
import { uploadCover } from './r2';

// Downloads a cover URL and uploads it to R2. Returns the R2 URL, or null if
// R2 is not configured or the download fails.
export async function fetchAndUploadCover(coverUrl: string): Promise<string | null> {
  if (!process.env['R2_ACCOUNT_ID'] || !process.env['R2_ACCESS_KEY_ID'] || !process.env['R2_PUBLIC_URL']) return null;
  if (coverUrl.startsWith(process.env['R2_PUBLIC_URL'])) return coverUrl;

  try {
    const response = await fetch(coverUrl);
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get('content-type') ?? 'image/jpeg';
    const { url } = await uploadCover(buffer, 'cover.jpg', contentType);
    return url;
  } catch {
    return null;
  }
}

export async function downloadAndStoreCover(bookId: number, coverUrl: string): Promise<void> {
  const r2Url = await fetchAndUploadCover(coverUrl);
  if (r2Url) {
    await pool.query('UPDATE books SET cover_url = $1 WHERE id = $2', [r2Url, bookId]);
  }
}
