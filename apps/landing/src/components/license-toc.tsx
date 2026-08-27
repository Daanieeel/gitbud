"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronUp, List } from "lucide-react";
import { cn } from "@gitbud/ui/utils";

export interface LicenseTocItem {
  level: number;
  id: string;
  text: string;
}

export function LicenseToc({ items }: { items: LicenseTocItem[] }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!buttonRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onClickOutside);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onClickOutside);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <>
      {/* Positioned as its own fixed element (rather than centered on the pill) so its
       * viewport-relative width never overflows the screen edge when the pill itself sits
       * left-aligned on narrow viewports, clear of the bottom-right Netlify badge. */}
      <div
        ref={panelRef}
        inert={!open}
        aria-hidden={!open}
        className={cn(
          "border-border bg-card/90 fixed inset-x-4 bottom-16 z-40 mx-auto max-w-md origin-bottom overflow-hidden rounded-2xl border shadow-xl backdrop-blur-xl transition-all duration-150 ease-out",
          open
            ? "pointer-events-auto max-h-[min(60vh,32rem)] scale-100 opacity-100"
            : "pointer-events-none max-h-0 scale-95 opacity-0",
        )}
      >
        <nav aria-label="Table of contents" className="max-h-[min(60vh,32rem)] overflow-y-auto p-3">
          <ul className="flex flex-col gap-0.5">
            {items.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "hover:bg-accent block truncate rounded-lg px-3 py-2 text-sm transition-colors",
                    item.level === 2 && "font-semibold",
                    item.level === 3 && "text-muted-foreground pl-5",
                    item.level === 4 && "text-muted-foreground pl-8 text-[0.8rem]",
                  )}
                >
                  {item.text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* Same bottom-4 offset and py-2 padding as the Netlify badge (fixed at right-4) so both
       * pills sit at the same height; left-4 on narrow screens keeps it clear of that badge,
       * moving to centered from sm up where there's room for both. */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="border-border bg-card/80 hover:bg-card fixed bottom-4 left-4 z-40 flex items-center gap-2 rounded-full border px-5 py-2 text-sm font-medium shadow-lg backdrop-blur-md transition-colors sm:left-1/2 sm:-translate-x-1/2"
      >
        <List className="size-4" aria-hidden />
        Contents
        <ChevronUp
          className={cn("size-4 transition-transform duration-300", open && "rotate-180")}
          aria-hidden
        />
      </button>
    </>
  );
}
