import Parser from 'rss-parser';
import pool from '../db';

type RssItem = Parser.Item & Record<string, unknown>;

const parser = new Parser({
  customFields: {
    item: [
      ['media:content',   'mediaContent'],
      ['media:thumbnail', 'mediaThumbnail'],
      ['content:encoded', 'contentEncoded'],
    ],
  },
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; SFFantasyShelf/1.0; +https://github.com/ziegler1/sf-fantasy-shelf)',
    'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
  },
});

interface FeedSource { name: string; url: string }

const FEEDS: FeedSource[] = [
  { name: 'Tor.com',        url: 'https://www.tor.com/feed/'              },
  { name: 'Locus Magazine', url: 'https://locusmag.com/feed/'             },
  { name: 'SFF World',      url: 'https://www.sffworld.com/feed/'         },
  { name: 'The Wertzone',   url: 'https://thewertzone.blogspot.com/feeds/posts/default' },
];

function extractImage(item: RssItem): string | null {
  const mc = item['mediaContent'] as { $?: { url?: string } } | undefined;
  if (mc?.$?.url) return mc.$.url;

  const mt = item['mediaThumbnail'] as { $?: { url?: string } } | undefined;
  if (mt?.$?.url) return mt.$.url;

  const html = (item['contentEncoded'] as string | undefined) ?? ((item.content as string | undefined) ?? '');
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

function truncate(s: string | null | undefined, max: number): string | null {
  if (!s) return null;
  const plain = s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return plain.length > max ? plain.slice(0, max - 1) + '…' : plain;
}

export async function fetchNewsFeeds(): Promise<{ source: string; added: number; error?: string }[]> {
  const results: { source: string; added: number; error?: string }[] = [];

  for (const feed of FEEDS) {
    let added = 0;
    try {
      const result = await parser.parseURL(feed.url);
      for (const raw of result.items.slice(0, 25)) {
        const item = raw as unknown as RssItem;
        if (!item.link || !item.title) continue;

        const image       = extractImage(item);
        const description = truncate(item.contentSnippet ?? (item.content as string | undefined), 400);
        const pubDate     = item.pubDate ? new Date(item.pubDate) : null;

        const { rowCount } = await pool.query(
          `INSERT INTO news_articles (source_name, title, url, description, image_url, published_at)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (url) DO NOTHING`,
          [feed.name, item.title.trim(), item.link, description, image, pubDate],
        );
        added += rowCount ?? 0;
      }
      console.log(`[news] ${feed.name}: +${added} articles`);
      results.push({ source: feed.name, added });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[news] fetch failed for ${feed.name}:`, msg);
      results.push({ source: feed.name, added: 0, error: msg });
    }
  }

  return results;
}
