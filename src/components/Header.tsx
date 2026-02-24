"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/", label: "Gewichtung" },
  { href: "/datenbank", label: "Datenbank" },
  { href: "/auswertung", label: "Auswertung" },
];

export default function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-6 h-14 flex items-center justify-between">
        <Link
          href="/"
          className="text-neutral-100 font-medium tracking-tight hover:text-amber-400 transition-colors"
        >
          Cryptowichtung
        </Link>
        <nav className="flex items-center gap-1">
          {NAV_LINKS.map((link) => {
            const isActive =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-amber-500/15 text-amber-400"
                    : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/60"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
