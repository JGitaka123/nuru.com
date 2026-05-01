import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_WEB_URL ?? "https://nuru.com";
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticUrls: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, changeFrequency: "daily", priority: 1.0 },
    { url: `${BASE}/search`, changeFrequency: "always", priority: 0.9 },
    { url: `${BASE}/pricing`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${BASE}/privacy`, changeFrequency: "yearly", priority: 0.3 },
  ];

  // Pull active listings (paginated; cap to 5,000 — Google's per-sitemap limit
  // is 50K, but we should split when it grows).
  try {
    const res = await fetch(`${API}/v1/listings?limit=200`, { next: { revalidate: 1800 } });
    if (!res.ok) return staticUrls;
    const data = (await res.json()) as { items: Array<{ id: string; publishedAt?: string }> };
    const listingUrls: MetadataRoute.Sitemap = data.items.map((l) => ({
      url: `${BASE}/listing/${l.id}`,
      lastModified: l.publishedAt ? new Date(l.publishedAt) : undefined,
      changeFrequency: "daily" as const,
      priority: 0.7,
    }));
    return [...staticUrls, ...listingUrls];
  } catch {
    return staticUrls;
  }
}
