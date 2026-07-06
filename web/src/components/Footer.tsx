"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";

export default function Footer() {
  const { t } = useI18n();
  return (
    <footer className="border-t border-ink-200 bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-ink-500">
        <span>© {new Date().getFullYear()} {t("footer.tagline")}</span>
        <nav className="flex gap-4">
          <Link href="/privacy" className="hover:text-brand-600">{t("footer.privacy")}</Link>
          <a href="mailto:hello@nuru.com" className="hover:text-brand-600">{t("footer.contact")}</a>
        </nav>
      </div>
    </footer>
  );
}
