"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AppHeader() {
  const pathname = usePathname();

  if (pathname?.startsWith("/dialer/ayaz")) {
    return null;
  }

  return (
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
  );
}
