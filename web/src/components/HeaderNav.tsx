"use client";

import { useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";
import ThemeToggle from "@/components/ThemeToggle";
import LangToggle from "@/components/LangToggle";
import { useI18n, type I18nKey } from "@/lib/i18n";
import { useSession } from "@/lib/session";

const TENANT_LINKS: Array<[string, I18nKey]> = [
  ["/search", "nav.search"],
  ["/messages", "nav.messages"],
  ["/me/saved", "nav.saved"],
  ["/me/applications", "nav.applications"],
  ["/me/viewings", "nav.viewings"],
];

export default function HeaderNav() {
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const { t } = useI18n();
  const { session, signOut } = useSession();

  const isAgent = session?.role === "AGENT" || session?.role === "LANDLORD";
  const isAdmin = session?.role === "ADMIN";
  const initial = (session?.name?.[0] ?? session?.role?.[0] ?? "?").toUpperCase();

  return (
    <header className="sticky top-0 z-30 border-b border-ink-200/70 bg-ink-50/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
        <Link href="/" onClick={() => setOpen(false)} aria-label="Nuru home">
          <Logo />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-6 text-sm text-ink-600 lg:flex">
          <Link href="/search" className="transition-colors hover:text-ink-900">{t("nav.search")}</Link>
          <Link href="/search?type=SALE" className="transition-colors hover:text-ink-900">Buy</Link>
          <Link href="/pricing" className="transition-colors hover:text-ink-900">{t("nav.pricing")}</Link>
          {!session && <Link href="/agent" className="transition-colors hover:text-ink-900">{t("nav.forAgents")}</Link>}
          {isAgent && <Link href="/agent" className="transition-colors hover:text-ink-900">Dashboard</Link>}
          {isAdmin && <Link href="/admin" className="transition-colors hover:text-ink-900">Admin</Link>}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-2">
            <LangToggle />
            <ThemeToggle />
          </div>

          {session ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenu((v) => !v)}
                className="flex items-center gap-2 rounded-full border border-ink-200 bg-surface py-1 pl-1 pr-3 text-sm font-medium text-ink-800 shadow-sm transition hover:border-ink-300"
                aria-haspopup="menu"
                aria-expanded={menu}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-500 text-sm font-semibold text-white">{initial}</span>
                <span className="hidden max-w-[8rem] truncate sm:inline">{session.name ?? "Account"}</span>
              </button>
              {menu && (
                <div className="absolute right-0 mt-2 w-52 overflow-hidden rounded-xl border border-ink-200 bg-surface py-1 text-sm shadow-lift">
                  <MenuLink href="/me/saved" onClick={() => setMenu(false)}>{t("nav.saved")}</MenuLink>
                  <MenuLink href="/me/applications" onClick={() => setMenu(false)}>{t("nav.applications")}</MenuLink>
                  <MenuLink href="/me/viewings" onClick={() => setMenu(false)}>{t("nav.viewings")}</MenuLink>
                  <MenuLink href="/messages" onClick={() => setMenu(false)}>{t("nav.messages")}</MenuLink>
                  {isAgent && <MenuLink href="/agent" onClick={() => setMenu(false)}>Agent dashboard</MenuLink>}
                  {isAdmin && <MenuLink href="/admin" onClick={() => setMenu(false)}>Admin</MenuLink>}
                  <div className="my-1 border-t border-ink-200" />
                  <button onClick={signOut} className="block w-full px-4 py-2 text-left text-ink-600 hover:bg-ink-100 hover:text-ink-900">Sign out</button>
                </div>
              )}
            </div>
          ) : (
            <Link href="/login" className="hidden rounded-full bg-ink-900 px-4 py-2 text-sm font-medium text-ink-50 transition hover:bg-ink-800 sm:inline-block">
              {t("nav.signIn")}
            </Link>
          )}

          {/* Mobile burger */}
          <button
            type="button"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="rounded-lg p-2 text-ink-700 hover:bg-ink-100 lg:hidden"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
              {open ? (<><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>)
                    : (<><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>)}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <nav className="border-t border-ink-200 bg-surface lg:hidden" aria-label="Mobile menu">
          <ul className="px-4 py-3">
            <li><Link href="/search?type=SALE" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 hover:bg-ink-100">Buy</Link></li>
            {TENANT_LINKS.map(([href, key]) => (
              <li key={href}>
                <Link href={href} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 hover:bg-ink-100">{t(key)}</Link>
              </li>
            ))}
            <li><Link href="/pricing" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 hover:bg-ink-100">{t("nav.pricing")}</Link></li>
            <li><Link href={isAgent ? "/agent" : "/agent"} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 hover:bg-ink-100">{isAgent ? "Dashboard" : t("nav.forAgents")}</Link></li>
            {isAdmin && <li><Link href="/admin" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2 hover:bg-ink-100">Admin</Link></li>}
            <li className="mt-2 flex items-center gap-2 px-3"><LangToggle /><ThemeToggle /></li>
            <li className="pt-2">
              {session ? (
                <button onClick={signOut} className="block w-full rounded-lg border border-ink-200 px-3 py-2 text-center font-medium">Sign out</button>
              ) : (
                <Link href="/login" onClick={() => setOpen(false)} className="block rounded-lg bg-ink-900 px-3 py-2 text-center font-medium text-ink-50">{t("nav.signIn")}</Link>
              )}
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}

function MenuLink({ href, onClick, children }: { href: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Link href={href} onClick={onClick} className="block px-4 py-2 text-ink-700 hover:bg-ink-100 hover:text-ink-900">
      {children}
    </Link>
  );
}
