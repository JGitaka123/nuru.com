import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import ServiceWorkerRegister from "./sw-register";

export const metadata: Metadata = {
  title: "Nuru — Find your home in Nairobi",
  description: "AI-native rental marketplace for Kenya. Verified listings, transparent escrow, instant search.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Nuru", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#f5840b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="border-b border-ink-200 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-white font-bold">N</span>
              <span className="font-semibold text-lg">Nuru</span>
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/search" className="hover:text-brand-600">Search</Link>
              <Link href="/agent" className="hover:text-brand-600">For agents</Link>
              <Link href="/login" className="rounded-md bg-brand-500 px-3 py-1.5 text-white hover:bg-brand-600">Sign in</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <ServiceWorkerRegister />
        <footer className="border-t border-ink-200 bg-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-6 text-sm text-ink-500">
            <span>© {new Date().getFullYear()} Nuru. Long-term rentals in Nairobi.</span>
            <nav className="flex gap-4">
              <Link href="/privacy" className="hover:text-brand-600">Privacy</Link>
              <a href="mailto:hello@nuru.com" className="hover:text-brand-600">Contact</a>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
