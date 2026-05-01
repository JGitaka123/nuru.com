import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Nuru",
  description: "How Nuru handles your personal data.",
};

export default function PrivacyPage() {
  return (
    <article className="prose mx-auto max-w-3xl space-y-4 rounded-xl bg-white p-8 ring-1 ring-ink-200">
      <h1 className="text-3xl font-bold">Privacy Policy</h1>
      <p className="text-sm text-ink-500">Last updated: TBD at launch</p>

      <p>
        Nuru.com (&quot;we&quot;, &quot;us&quot;) is registered as a data controller with
        Kenya&apos;s Office of the Data Protection Commissioner (ODPC reference
        number: <strong>TBD at launch</strong>). This policy explains what
        personal data we collect, why we collect it, and your rights under
        the Data Protection Act, 2019.
      </p>

      <h2 className="text-xl font-semibold">What we collect</h2>
      <ul className="list-disc space-y-1 pl-6">
        <li>Phone number (E.164 format) — for sign-in and SMS notifications.</li>
        <li>Name and (optional) email address — to identify you to agents.</li>
        <li>National ID number — <strong>hashed</strong> and stored as a hash;
            we never keep the raw value.</li>
        <li>KRA PIN (agents only) — for KYC compliance.</li>
        <li>Listing photos and descriptions you upload.</li>
        <li>Payment metadata from M-Pesa (M-Pesa receipt numbers, amounts).
            We do <strong>not</strong> store your M-Pesa PIN.</li>
        <li>Search queries and viewing bookings — to improve recommendations.</li>
      </ul>

      <h2 className="text-xl font-semibold">Why we collect it</h2>
      <p>
        To operate the rental marketplace: connect tenants and agents,
        verify identities, hold deposits in escrow, send notifications, and
        improve our AI-powered search.
      </p>

      <h2 className="text-xl font-semibold">Who we share it with</h2>
      <ul className="list-disc space-y-1 pl-6">
        <li>Safaricom (M-Pesa) — for processing deposits and refunds.</li>
        <li>Africa&apos;s Talking — for delivering SMS messages.</li>
        <li>Anthropic — for AI processing of listings and search queries.
            We send minimum necessary data; never raw national IDs or
            full names unless functionally required.</li>
        <li>Cloudflare — for CDN, storage, and DDoS protection.</li>
        <li>Law enforcement — only when required by Kenyan law.</li>
      </ul>

      <h2 className="text-xl font-semibold">Your rights</h2>
      <p>
        Under the Data Protection Act 2019, you have the right to access,
        correct, delete, and port your data, and to object to processing.
        Contact <a className="text-brand-600 underline" href="mailto:privacy@nuru.com">privacy@nuru.com</a> to
        exercise any of these.
      </p>

      <h2 className="text-xl font-semibold">Retention</h2>
      <p>
        We retain account data while your account is active. Deleted accounts
        are anonymized within 30 days, except for transaction records we are
        legally required to keep (typically 7 years for financial records).
      </p>

      <h2 className="text-xl font-semibold">Contact</h2>
      <p>
        Data Protection Officer: <a className="text-brand-600 underline" href="mailto:dpo@nuru.com">dpo@nuru.com</a>.
        ODPC complaint portal: <a className="text-brand-600 underline" href="https://www.odpc.go.ke/" target="_blank" rel="noreferrer">odpc.go.ke</a>.
      </p>
    </article>
  );
}
