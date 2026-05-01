/** KES cents (DB integer) → "KES 60,000" / "60,000". */
export function formatKes(cents: number, withPrefix = true): string {
  const whole = Math.round(cents / 100);
  const formatted = whole.toLocaleString("en-KE");
  return withPrefix ? `KES ${formatted}` : formatted;
}

/** "TWO_BR" → "2 bedroom", "BEDSITTER" → "Bedsitter". */
export function formatCategory(c: string): string {
  switch (c) {
    case "BEDSITTER": return "Bedsitter";
    case "STUDIO": return "Studio";
    case "ONE_BR": return "1 bedroom";
    case "TWO_BR": return "2 bedroom";
    case "THREE_BR": return "3 bedroom";
    case "FOUR_PLUS_BR": return "4+ bedroom";
    case "MAISONETTE": return "Maisonette";
    case "TOWNHOUSE": return "Townhouse";
    default: return c;
  }
}

export function photoUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  const base = process.env.NEXT_PUBLIC_PHOTO_URL ?? "https://photos.nuru.com";
  return `${base}/${key}`;
}
