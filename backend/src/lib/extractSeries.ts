// Shared series extraction logic used by search.ts and populateSeriesBooks.ts

export function extractSeries(
  title: string,
  subtitle: string | undefined,
  seriesInfo?: {
    bookSeries?: { orderNumber?: string }[];
  },
): { name: string | null; position: number | null } {
  const orderStr = seriesInfo?.bookSeries?.[0]?.orderNumber;
  const apiPosition = orderStr ? parseFloat(orderStr) : null;

  const ordinals: Record<string, number> = {
    one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  };

  for (const text of [subtitle ?? '', title]) {
    if (!text) continue;

    // "Book N of [the] Series Name"
    const bookOf = text.match(
      /\bbook\s+(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen)\s+of\s+(?:the\s+)?(.+?)(?:\s*$|\s*\()/i,
    );
    if (bookOf) {
      const pos = /^\d/.test(bookOf[1])
        ? parseFloat(bookOf[1])
        : (ordinals[bookOf[1].toLowerCase()] ?? apiPosition);
      return { name: bookOf[2].trim(), position: pos ?? apiPosition };
    }

    // "(Series Name, #N)" or "(Series Name, Book N)"
    const paren = text.match(/\(([^,]+),\s*(?:#|book\s+)?(\d+(?:\.\d+)?)\)/i);
    if (paren) return { name: paren[1].trim(), position: parseFloat(paren[2]) };

    // "Series Name #N"
    const hash = text.match(/^(.+?)\s+#(\d+(?:\.\d+)?)$/);
    if (hash) return { name: hash[1].trim(), position: parseFloat(hash[2]) };
  }

  return { name: null, position: apiPosition };
}

export function normaliseSeries(name: string): string {
  return name.toLowerCase().replace(/^the\s+/, '').replace(/[^a-z0-9]/g, '');
}

export function isSameSeries(a: string, b: string): boolean {
  return normaliseSeries(a) === normaliseSeries(b);
}
