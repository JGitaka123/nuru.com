"use client";

import Link from "next/link";
import Logo from "@/components/Logo";
import { useI18n } from "@/lib/i18n";

export default function Footer() {
  const { t } = useI18n();
  const year = new Date().getFullYear();
  return (
    <footer className="mt-20 border-t border-ink-200 bg-surface">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-4 text-sm leading-relaxed text-ink-500">
            Verified rentals and homes for sale across Nairobi, with deposits held in M-Pesa escrow until you move in.
          </p>
        </div>
        <FooterCol title="Explore" links={[["Rent", "/search"], ["Buy", "/search?type=SALE"], ["Pricing", "/pricing"]]} />
        <FooterCol title="For agents" links={[["List a property", "/agent/new"], ["Agent dashboard", "/agent"], ["Verification", "/agent/verify"]]} />
        <FooterCol title="Company" links={[[t("footer.privacy"), "/privacy"], [t("footer.contact"), "mailto:hello@nuruhomes.com"]]} />
      </div>
      <div className="border-t border-ink-200">
        <div className="mx-auto max-w-6xl px-4 py-5 text-xs text-ink-400 sm:px-6">
          © {year} {t("footer.tagline")}
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: Array<[string, string]> }) {
  return (
    <div>
      <h3 className="font-sans text-xs font-semibold uppercase tracking-[0.14em] text-ink-400">{title}</h3>
      <ul className="mt-4 space-y-2.5 text-sm text-ink-600">
        {links.map(([label, href]) => (
          <li key={href}>
            {href.startsWith("mailto:")
              ? <a href={href} className="transition-colors hover:text-brand-600">{label}</a>
              : <Link href={href} className="transition-colors hover:text-brand-600">{label}</Link>}
          </li>
        ))}
      </ul>
    </div>
  );
}
