import Link from "next/link";

/** Editorial page heading — serif title, optional eyebrow + actions. */
export function PageHeading({
  eyebrow, title, subtitle, actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="font-sans text-xs font-semibold uppercase tracking-[0.16em] text-brand-700">{eyebrow}</p>
        )}
        <h1 className="mt-1.5 font-serif text-3xl leading-tight text-ink-900 sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1.5 text-ink-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** A single stat tile for dashboards. */
export function StatTile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-2xl border border-ink-200 bg-surface p-5 shadow-card">
      <p className="font-sans text-xs font-medium uppercase tracking-[0.12em] text-ink-400">{label}</p>
      <p className="mt-2 font-serif text-3xl font-semibold tracking-tightish text-ink-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

/** A bordered content panel. */
export function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-ink-200 bg-surface p-5 shadow-card sm:p-6 ${className}`}>
      {children}
    </div>
  );
}

/** Secondary button / link styling. */
export const btnSecondary =
  "rounded-xl border border-ink-200 bg-surface px-4 py-2 text-sm font-medium text-ink-700 transition hover:border-ink-300";
export const btnPrimary =
  "rounded-xl bg-ink-900 px-4 py-2 text-sm font-medium text-ink-50 transition hover:bg-ink-800";
export const btnBrand =
  "rounded-xl bg-brand-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-600";

/** Shared admin section nav, rendered on every admin page for consistency. */
const ADMIN_LINKS: Array<[string, string]> = [
  ["/admin", "Overview"],
  ["/admin/subscriptions", "Subscriptions"],
  ["/admin/agent-tasks", "CRM queue"],
  ["/admin/leads", "Leads"],
  ["/admin/campaigns", "Campaigns"],
  ["/admin/reports", "Fraud reports"],
  ["/admin/ai-queue", "AI feedback"],
  ["/admin/verification", "Verification"],
];

export function AdminNav({ active }: { active?: string }) {
  return (
    <nav className="flex flex-wrap gap-1.5 text-sm">
      {ADMIN_LINKS.map(([href, label]) => {
        const isActive = active === href;
        return (
          <Link key={href} href={href}
            className={`rounded-full px-3.5 py-1.5 transition ${
              isActive ? "bg-ink-900 text-ink-50" : "border border-ink-200 bg-surface text-ink-600 hover:border-ink-300 hover:text-ink-900"
            }`}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

const STATUS_STYLES: Record<string, string> = {
  DRAFT: "bg-ink-100 text-ink-700",
  PENDING_REVIEW: "bg-amber-100 text-amber-800",
  ACTIVE: "bg-emerald-100 text-emerald-800",
  PAUSED: "bg-ink-200 text-ink-800",
  RENTED: "bg-brand-100 text-brand-800",
  REMOVED: "bg-red-100 text-red-700",
  TRIALING: "bg-brand-100 text-brand-800",
  PAST_DUE: "bg-amber-100 text-amber-800",
  CANCELED: "bg-ink-200 text-ink-700",
  EXPIRED: "bg-red-100 text-red-700",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? "bg-ink-100 text-ink-700"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
