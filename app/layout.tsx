import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Logistics Analytics Dashboard",
  description:
    "AI-orchestrated logistics analytics — deterministic KPIs, queries, and demand forecasting.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen">
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
              <Link href="/" className="flex items-center gap-2 font-semibold">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">
                  📦
                </span>
                <span>Logistics Analytics</span>
              </Link>
              <nav className="flex gap-1 text-sm">
                <Link
                  href="/"
                  className="rounded-md px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100"
                >
                  Dashboard
                </Link>
                <Link
                  href="/chat"
                  className="rounded-md px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100"
                >
                  Ask AI
                </Link>
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
          <footer className="mx-auto max-w-6xl px-4 py-8 text-xs text-slate-400">
            AI routes &amp; interprets · a deterministic engine computes every number.
          </footer>
        </div>
      </body>
    </html>
  );
}
