import Link from "next/link";

export default function HomePage() {
  return (
    <div className="space-y-12">
      <section className="rounded-2xl bg-white p-8 shadow-sm sm:p-12">
        <h1 className="text-3xl font-bold sm:text-5xl">Find your next home in Nairobi.</h1>
        <p className="mt-4 max-w-xl text-lg text-ink-600">
          Conversational search. Verified listings. Deposits held safely in M-Pesa escrow until you confirm move-in.
        </p>
        <form action="/search" className="mt-8 flex flex-col gap-3 sm:flex-row">
          <input
            name="q"
            placeholder="2BR Kilimani under 60K with parking"
            className="flex-1 rounded-lg border border-ink-200 bg-white px-4 py-3 text-base shadow-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-200"
            autoFocus
          />
          <button
            type="submit"
            className="rounded-lg bg-brand-500 px-6 py-3 font-semibold text-white shadow-sm hover:bg-brand-600"
          >
            Search
          </button>
        </form>
        <div className="mt-4 flex flex-wrap gap-2 text-sm text-ink-500">
          <span>Try:</span>
          {[
            "2BR Kilimani under 60K with parking",
            "natafuta keja Kile na pet zangu, around 80k",
            "quiet family-friendly Lavington max 120k",
          ].map((q) => (
            <Link key={q} href={`/search?q=${encodeURIComponent(q)}`} className="rounded-full bg-ink-100 px-3 py-1 hover:bg-ink-200">
              {q}
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-6 sm:grid-cols-3">
        <Card title="Verified listings" body="Every photo and price is checked. No bait pricing. No stolen photos." />
        <Card title="Escrow deposits" body="Your deposit sits in M-Pesa escrow until you confirm move-in. Refunded if anything's off." />
        <Card title="Talk to the agent in your language" body="English, Swahili, or Sheng — we understand all three. Voice notes too." />
      </section>

      <section className="rounded-2xl bg-brand-50 p-8 ring-1 ring-brand-100">
        <h2 className="text-2xl font-semibold">Are you an agent?</h2>
        <p className="mt-2 text-ink-700">List a property in 60 seconds. Photos in → AI-drafted listing out. You review and publish.</p>
        <Link href="/agent" className="mt-4 inline-block rounded-md bg-brand-500 px-4 py-2 font-semibold text-white hover:bg-brand-600">
          Get started →
        </Link>
      </section>
    </div>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white p-6">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 text-sm text-ink-600">{body}</p>
    </div>
  );
}
