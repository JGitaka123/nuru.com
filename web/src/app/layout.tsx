import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorkerRegister from "./sw-register";
import { ToastViewport } from "@/components/Toast";
import HeaderNav from "@/components/HeaderNav";
import Footer from "@/components/Footer";
import { LangProvider } from "@/lib/i18n";

// Applied before paint so a dark-mode reload never flashes white.
const THEME_SCRIPT = `try{var t=localStorage.getItem("nuru-theme");if(t==="dark"||(!t&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dark");var l=localStorage.getItem("nuru-lang");if(l)document.documentElement.lang=l;}catch(e){}`;

export const metadata: Metadata = {
  title: "Nuru — Rent or buy your home in Nairobi",
  description: "Verified rentals and homes for sale across Nairobi. Conversational search, transparent M-Pesa escrow, no bait listings.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: "/icons/icon-192.png",
  },
  appleWebApp: { capable: true, title: "Nuru", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#d97a1e",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <LangProvider>
          <HeaderNav />
          <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
          <ServiceWorkerRegister />
          <ToastViewport />
          <Footer />
        </LangProvider>
      </body>
    </html>
  );
}
