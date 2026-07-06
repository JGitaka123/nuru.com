export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: {
    e?: string;
  };
}

export default async function UnsubscribePage({ searchParams }: PageProps) {
  const email = decodeEmail(searchParams.e);
  const ok = email ? await unsubscribe(email) : false;

  return (
    <main className="mx-auto max-w-xl rounded-xl bg-surface p-8 text-center ring-1 ring-ink-200">
      <h1 className="text-3xl font-bold">{ok ? "You're unsubscribed" : "We could not unsubscribe you"}</h1>
      <p className="mt-3 text-ink-600">
        {ok
          ? "You will no longer receive Nuru marketing emails."
          : "The unsubscribe link is invalid or temporarily unavailable. You can contact hello@nuru.com for help."}
      </p>
    </main>
  );
}

function decodeEmail(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const email = Buffer.from(token, "base64url").toString("utf8").trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  } catch {
    return null;
  }
}

async function unsubscribe(email: string): Promise<boolean> {
  const base = (process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/v1/unsubscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}
