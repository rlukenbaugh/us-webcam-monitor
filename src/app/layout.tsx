import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";
import { QueryProvider } from "@/components/providers/query-provider";

export const metadata: Metadata = {
  title: "US Webcam Monitor",
  description: "National map of public U.S. webcams"
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-slate-100 text-slate-900 antialiased">
        <header className="border-b border-slate-200 bg-white px-4 py-3">
          <div className="mx-auto flex h-9 max-w-6xl items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">US Webcam Monitor MVP</p>
              <p className="text-xs text-slate-500">Public webcam mapping and moderation desktop app</p>
            </div>
            <nav className="flex items-center gap-2 text-sm">
              <Link href="/map" className="rounded-lg px-3 py-1.5 text-slate-700 hover:bg-slate-100">
                Map
              </Link>
              <Link href="/search" className="rounded-lg px-3 py-1.5 text-slate-700 hover:bg-slate-100">
                Search
              </Link>
              <Link href="/favorites" className="rounded-lg px-3 py-1.5 text-slate-700 hover:bg-slate-100">
                Favorites
              </Link>
              <Link href="/sources" className="rounded-lg px-3 py-1.5 text-slate-700 hover:bg-slate-100">
                Sources
              </Link>
              <Link href="/admin" className="rounded-lg px-3 py-1.5 text-slate-700 hover:bg-slate-100">
                Admin
              </Link>
            </nav>
          </div>
        </header>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
