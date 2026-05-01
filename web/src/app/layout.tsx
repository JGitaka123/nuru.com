import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorkerRegister from "./sw-register";
import { ToastViewport } from "@/components/Toast";
import HeaderNav from "@/components/HeaderNav";
import Link from "next/link";

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
        <HeaderNav />
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <ServiceWorkerRegister />
        <ToastViewport />
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
