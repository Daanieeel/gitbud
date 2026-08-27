"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import {
  BookOpen,
  CircleHelp,
  History,
  Menu,
  Scale,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@gitbud/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@gitbud/ui/select";
import { cn } from "@gitbud/ui/utils";
import { isThemeValue, THEME_ICONS, THEME_LABELS, THEME_VALUES } from "@/components/theme-toggle";

interface NavLink {
  label: string;
  href: string;
}

const LINK_ICONS = {
  "/features": Sparkles,
  "/docs": BookOpen,
  "/changelog": History,
  "/faq": CircleHelp,
  "/license": Scale,
} satisfies Record<string, LucideIcon>;

const rowClass =
  "flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-base transition-colors hover:bg-accent";

function MobileNavLink({ link, onClick }: { link: NavLink; onClick: () => void }) {
  const Icon = Object.entries(LINK_ICONS).find(([key]) => key === link.href)?.[1];

  return (
    <Link href={link.href} onClick={onClick} className={rowClass}>
      {Icon && <Icon className="size-5 shrink-0" />}
      <span className="flex-1">{link.label}</span>
    </Link>
  );
}

function MobileThemeSelect() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // next-themes resolves the persisted theme only after mount, so the
  // trigger falls back to "system" until then to avoid a hydration mismatch.
  useEffect(() => setMounted(true), []);

  const currentTheme = mounted && isThemeValue(theme) ? theme : "system";
  const CurrentIcon = THEME_ICONS[currentTheme];

  return (
    <Select value={currentTheme} onValueChange={setTheme}>
      <SelectTrigger size="lg" className="w-full rounded-xl">
        {/* Radix mirrors the selected item's raw children into a non-flex span by
         * default, which stacks an icon above its label instead of beside it.
         * Passing explicit children renders our own flex row instead. */}
        <SelectValue>
          <span className="flex items-center gap-2">
            <CurrentIcon className="size-5 shrink-0" />
            {THEME_LABELS[currentTheme]}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="z-[70]">
        {THEME_VALUES.map((value) => {
          const Icon = THEME_ICONS[value];
          return (
            <SelectItem key={value} value={value} className="py-3 text-base">
              <Icon className="size-5 shrink-0" />
              {THEME_LABELS[value]}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

export function MobileNav({ links }: { links: NavLink[] }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="icon"
        aria-label="Menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Menu className="size-5" />
      </Button>

      {mounted &&
        createPortal(
          // Expands from the trigger's corner with an "expo out" ease in and a matching
          // "expo in" ease out, staying mounted (closed = zero-area clip) so the collapse
          // can animate instead of unmounting abruptly.
          <div
            inert={!open}
            aria-hidden={!open}
            className={cn(
              "bg-card/95 fixed inset-0 z-[60] flex h-dvh w-dvw flex-col overflow-y-auto backdrop-blur-xl",
              open
                ? "pointer-events-auto [clip-path:circle(150%_at_100%_0%)] [transition:clip-path_0.7s_cubic-bezier(0.22,1,0.36,1)]"
                : "pointer-events-none [clip-path:circle(0%_at_100%_0%)] [transition:clip-path_0.3s_cubic-bezier(0.7,0,0.84,0)]",
            )}
          >
            <div className="px-4 pt-4">
              <div className="flex w-full items-center justify-between py-2.5 pr-2 pl-5">
                <Link href="/" onClick={close} className="flex shrink-0 items-center gap-2">
                  <Image
                    src="/gitbud-logo.png"
                    alt="GitBud"
                    width={24}
                    height={24}
                    className="dark:invert"
                  />
                  <span className="text-base font-semibold tracking-tight">GitBud</span>
                </Link>
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  aria-label="Close"
                  onClick={close}
                >
                  <X className="size-5" />
                </Button>
              </div>
            </div>

            <div className="flex flex-1 flex-col gap-6 px-4 pt-4 pb-10">
              <div className="flex flex-col gap-0.5">
                {links.map((link) => (
                  <MobileNavLink key={link.href} link={link} onClick={close} />
                ))}
              </div>

              <div className="mt-auto">
                <MobileThemeSelect />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
