"use client";

import { useState } from "react";
import Link from "next/link";

const TENANT_LINKS: Array<[string, string]> = [
  ["/search", "Search"],
  ["/messages", "Messages"],
  ["/me/saved", "Saved"],
  ["/me/searches", "Alerts"],
  ["/me/applications", "Applications"],
  ["/me/viewings", "Viewings"],
  ["/pricing", "Pricing"],
];

export default function HeaderNav() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-ink-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-white font-bold">N</span>
          <span className="font-semibold text-lg">Nuru</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-4 text-sm sm:flex">
          {TENANT_LINKS.map(([href, label]) => (
            <Link key={href} href={href} className="hover:text-brand-600">{label}</Link>
          ))}
          <Link href="/agent" className="hover:text-brand-600">For agents</Link>
          <Link href="/login" className="rounded-md bg-brand-500 px-3 py-1.5 font-medium text-white hover:bg-brand-600">Sign in</Link>
        </nav>

        {/* Mobile burger */}
        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="rounded-md p-2 text-ink-700 hover:bg-ink-100 sm:hidden"
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

      {/* Mobile drawer */}
      {open && (
        <nav className="border-t border-ink-200 bg-white sm:hidden" aria-label="Mobile menu">
          <ul className="px-4 py-3">
            {TENANT_LINKS.map(([href, label]) => (
              <li key={href}>
                <Link href={href} onClick={() => setOpen(false)} className="block rounded-md px-3 py-2 hover:bg-ink-100">
                  {label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/agent" onClick={() => setOpen(false)} className="block rounded-md px-3 py-2 hover:bg-ink-100">
                For agents
              </Link>
            </li>
            <li className="pt-2">
              <Link href="/login" onClick={() => setOpen(false)} className="block rounded-md bg-brand-500 px-3 py-2 text-center font-medium text-white hover:bg-brand-600">
                Sign in
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
