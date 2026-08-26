"use client";

import { useEffect, useState, type SVGProps } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@gitbud/ui/button";
import { GitHubMark } from "@gitbud/ui/brand-logo";
import { cn } from "@gitbud/ui/utils";
import { ThemeToggle } from "@/components/theme-toggle";

interface NavLink {
  label: string;
  href: string;
}

function formatStars(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(count);
}

function StarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 2.5l2.94 6.32 6.94.76-5.2 4.75 1.46 6.86L12 17.77l-6.14 3.42 1.46-6.86-5.2-4.75 6.94-.76Z" />
    </svg>
  );
}

export function NavShell({
  links,
  githubLabel,
  stars,
}: {
  links: NavLink[];
  githubLabel: string;
  stars: number | null;
}) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-4 z-50 flex w-full justify-center px-4">
      <nav
        className={cn(
          "flex w-full items-center justify-between gap-4 rounded-2xl border border-transparent py-2.5 pr-2 pl-5 transition-all duration-300",
          scrolled
            ? "border-border bg-card/80 max-w-4xl backdrop-blur-md"
            : "max-w-[770px] bg-transparent",
        )}
      >
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <Image
            src="/gitbud-logo.png"
            alt="GitBud"
            width={24}
            height={24}
            className="dark:invert"
          />
          <span className="text-base font-semibold tracking-tight">GitBud</span>
        </Link>

        <ul className="hidden items-center gap-6 sm:flex">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="text-muted-foreground hover:text-foreground text-sm font-medium transition-colors"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="secondary" asChild>
            <Link
              href="https://github.com/Daanieeel/gitbud"
              target="_blank"
              rel="noopener noreferrer"
              className="gap-2"
            >
              <GitHubMark className="size-4" />
              {githubLabel}
              {stars !== null && (
                <span className="text-muted-foreground border-foreground/20 flex items-center gap-1 border-l pl-2">
                  <StarIcon className="text-accent-yellow size-3.5" />
                  {formatStars(stars)}
                </span>
              )}
            </Link>
          </Button>
        </div>
      </nav>
    </header>
  );
}
