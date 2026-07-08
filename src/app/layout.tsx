import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TyreFlow",
  description: "Manage TyreFlow subscribers, coverage, and caller workflows.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[#eef1e7] text-[#151713]">
        <header className="sticky top-0 z-50 border-b border-black/8 bg-[#f8faf4]/90 px-4 backdrop-blur-xl sm:px-6 lg:px-10">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-2xl bg-[#151713] text-sm font-black text-[#dff1a0]">
                TF
              </span>
              <span className="text-sm font-semibold tracking-[-0.02em]">
                TyreFlow
              </span>
            </Link>
            <nav className="flex items-center gap-2 text-sm font-medium">
              <Link
                href="/"
                className="rounded-full px-3 py-2 text-black/62 transition hover:bg-black/[0.04] hover:text-black"
              >
                Subscribers
              </Link>
              <Link
                href="/dialer"
                className="rounded-full px-3 py-2 text-black/62 transition hover:bg-black/[0.04] hover:text-black"
              >
                Dialer
              </Link>
              <Link
                href="/dialer/admin"
                className="rounded-full bg-[#151713] px-3 py-2 text-white shadow-sm transition hover:bg-[#2a2e24]"
              >
                Admin
              </Link>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
