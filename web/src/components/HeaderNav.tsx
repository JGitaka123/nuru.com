"use client";

import { useState } from "react";
import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import LangToggle from "@/components/LangToggle";
import { useI18n, type I18nKey } from "@/lib/i18n";

const TENANT_LINKS: Array<[string, I18nKey]> = [
  ["/search", "nav.search"],
  ["/messages", "nav.messages"],
  ["/me/saved", "nav.saved"],
  ["/me/searches", "nav.alerts"],
  ["/me/applications", "nav.applications"],
  ["/me/viewings", "nav.viewings"],
  ["/pricing", "nav.pricing"],
];

export default function HeaderNav() {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();

  return (
    <header className="sticky top-0 z-30 border-b border-ink-200 bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-ink-900 text-white font-bold">N</span>
          <span className="leading-tight">
            <span className="block text-lg font-bold">Nuru</span>
            <span className="hidden text-xs text-ink-500 md:block">Nairobi rentals</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-4 text-sm sm:flex">
          <Link href="/search" className="rounded-md bg-ink-100 px-3 py-2 font-semibold text-ink-800 hover:bg-ink-200">
            {t("nav.search")}
          </Link>
          {TENANT_LINKS.map(([href, key]) => (
            href === "/search" ? null : (
              <Link key={href} href={href} className="hover:text-brand-600">{t(key)}</Link>
            )
          ))}
          <Link href="/agent" className="hover:text-brand-600">{t("nav.forAgents")}</Link>
          <LangToggle />
          <ThemeToggle />
          <Link href="/login" className="rounded-md bg-brand-500 px-3 py-2 font-semibold text-white hover:bg-brand-600">{t("nav.signIn")}</Link>
        </nav>

        {/* Mobile: toggles stay visible next to the burger */}
        <div className="flex items-center gap-1 sm:hidden">
          <LangToggle />
          <ThemeToggle />
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="rounded-md p-2 text-ink-700 hover:bg-ink-100"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {open ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              ) : (
                <>
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <nav className="border-t border-ink-200 bg-surface sm:hidden" aria-label="Mobile menu">
          <ul className="px-4 py-3">
            {TENANT_LINKS.map(([href, key]) => (
              <li key={href}>
                <Link href={href} onClick={() => setOpen(false)} className="block rounded-md px-3 py-2 hover:bg-ink-100">
                  {t(key)}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/agent" onClick={() => setOpen(false)} className="block rounded-md px-3 py-2 hover:bg-ink-100">
                {t("nav.forAgents")}
              </Link>
            </li>
            <li className="pt-2">
              <Link href="/login" onClick={() => setOpen(false)} className="block rounded-md bg-brand-500 px-3 py-2 text-center font-medium text-white hover:bg-brand-600">
                {t("nav.signIn")}
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
