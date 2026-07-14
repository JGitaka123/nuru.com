/**
 * API client. In dev, requests go to /api/* which Next rewrites to the
 * Fastify API on :4000. In prod, NEXT_PUBLIC_API_URL points at the API host
 * directly and we hit it without the rewrite.
 */

const API_BASE = typeof window === "undefined"
  ? process.env.API_URL ?? "http://localhost:4000"
  : ""; // browser → use the rewrite

const TOKEN_KEY = "nuru.session";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

interface RequestOpts {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Include the bearer token if available. Default true. */
  auth?: boolean;
}

export async function api<T = unknown>(path: string, opts: RequestOpts = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.auth !== false) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const url = path.startsWith("http") ? path : `${API_BASE}${path.startsWith("/api/") ? path : "/api" + path}`;
  const res = await fetch(url, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.code ?? "UNKNOWN",
      data?.message ?? `Request failed: ${res.status}`,
      data?.details,
    );
  }
  return data as T;
}

export interface SearchResult {
  filters: {
    neighborhoods: string[];
    bedroomsMin: number | null;
    bedroomsMax: number | null;
    rentMaxKes: number | null;
    mustHave: string[];
    semanticQuery: string;
    detectedLanguage: string;
    clarifyingQuestion: string | null;
  };
  results: Array<{
    id: string;
    title: string;
    neighborhood: string;
    bedrooms: number;
    rent_kes_cents: number;
    primary_photo_key: string | null;
    description: string;
    verification_status?: string;
    lat?: number | null;
    lng?: number | null;
    relevance: number;
  }>;
  clarifyingQuestion: string | null;
  /** True when AI parsing/ranking was unavailable and keyword matching was used. */
  degraded?: boolean;
}

export interface Listing {
  id: string;
  title: string;
  description: string;
  category: string;
  bedrooms: number;
  bathrooms: number;
  rentKesCents: number;
  depositMonths: number;
  features: string[];
  neighborhood: string;
  estate?: string | null;
  primaryPhotoKey?: string | null;
  photoKeys: string[];
  verificationStatus: string;
  fraudScore: number;
  status: string;
  publishedAt?: string | null;
  lat?: number | null;
  lng?: number | null;
  agent?: { id: string; name: string | null; phoneE164: string | null; email?: string | null; verificationStatus: string };
}

export interface SessionUser {
  id: string;
  role: "TENANT" | "AGENT" | "LANDLORD" | "ADMIN";
  name: string | null;
  phoneE164: string | null;
  email: string | null;
  preferredLang?: string;
  verificationStatus?: string;
}
