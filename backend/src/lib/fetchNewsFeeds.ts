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
  timeout: 10000,
});

interface FeedSource { name: string; url: string }

const FEEDS: FeedSource[] = [
  { name: 'Tor.com',         url: 'https://www.tor.com/feed/'                         },
  { name: 'Locus Magazine',  url: 'https://locusmag.com/feed/'                        },
  { name: 'Fantasy Faction', url: 'https://fantasy-faction.com/feed'                  },
  { name: 'SFF World',       url: 'https://www.sffworld.com/feed/'                    },
  { name: 'Reddit Fantasy',  url: 'https://www.reddit.com/r/Fantasy/hot.rss?limit=20' },
];

function extractImage(item: RssItem): string | null {
  const mc = item['mediaContent'] as { $?: { url?: string } } | undefined;
  if (mc?.$?.url) return mc.$.url;

  const mt = item['mediaThumbnail'] as { $?: { url?: string } } | undefined;
  if (mt?.$?.url) return mt.$.url;

  const html = (item['contentEncoded'] as string | undefined) ?? (item.content ?? '');
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

function truncate(s: string | null | undefined, max: number): string | null {
  if (!s) return null;
  const plain = s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return plain.length > max ? plain.slice(0, max - 1) + '…' : plain;
}

export async function fetchNewsFeeds(): Promise<void> {
  for (const feed of FEEDS) {
    try {
      const result = await parser.parseURL(feed.url);
      for (const raw of result.items.slice(0, 25)) {
        const item = raw as unknown as RssItem;
        if (!item.link || !item.title) continue;

        const image       = extractImage(item);
        const description = truncate(item.contentSnippet ?? (item.content as string | undefined), 400);
        const pubDate     = item.pubDate ? new Date(item.pubDate) : null;

        await pool.query(
          `INSERT INTO news_articles (source_name, title, url, description, image_url, published_at)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (url) DO NOTHING`,
          [feed.name, item.title.trim(), item.link, description, image, pubDate],
        );
      }
    } catch (err) {
      console.error(`[news] fetch failed for ${feed.name}:`, err instanceof Error ? err.message : err);
    }
  }
}
