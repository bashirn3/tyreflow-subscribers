import Link from "next/link";

type AyazNavProps = {
  active: "dialer" | "subscribers";
};

export function AyazNav({ active }: AyazNavProps) {
  const links = [
    { href: "/dialer/ayaz", label: "Dialer", key: "dialer" },
    { href: "/dialer/ayaz/subscribers", label: "My subscribers", key: "subscribers" },
  ] as const;

  return (
    <header className="border-b border-black/8 bg-[#f8faf4]/90 px-4 backdrop-blur-xl sm:px-6 lg:px-10">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-2xl bg-[#151713] text-sm font-black text-[#dff1a0]">
            TF
          </span>
          <span className="text-sm font-semibold tracking-[-0.02em]">
            Ayaz workspace
          </span>
        </div>
        <nav className="flex items-center gap-2 text-sm font-medium">
          {links.map((link) => (
            <Link
              key={link.key}
              href={link.href}
              className={`rounded-full px-3 py-2 transition ${
                active === link.key
                  ? "bg-[#151713] text-white shadow-sm"
                  : "text-black/62 hover:bg-black/[0.04] hover:text-black"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
