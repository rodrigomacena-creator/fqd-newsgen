"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

const NAV_LINKS = [
  { href: "/", label: "Gerar" },
  { href: "/noticias", label: "Histórico" },
  { href: "/configuracoes", label: "Configurações" },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
        <Link href="/" className="inline-flex shrink-0 items-center gap-2">
          <Image
            src="/logo-fqdtv.png"
            alt="FQD tv"
            width={72}
            height={36}
            priority
            className="logo-img h-9 w-[72px] shrink-0"
          />
          <span className="hidden whitespace-nowrap text-xl font-bold tracking-tight text-accent-yellow md:inline">
            News GEN
          </span>
        </Link>

        <div className="flex items-center gap-1">
          <nav className="flex items-center gap-1">
            {NAV_LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                    active
                      ? "bg-surface text-foreground"
                      : "text-text-secondary hover:bg-surface hover:text-foreground"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
