"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@gitbud/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@gitbud/ui/popover";
import { getMessages } from "@/i18n/get-messages";

const THEME_VALUES = ["light", "dark", "system"] as const;
type ThemeValue = (typeof THEME_VALUES)[number];

function isThemeValue(value: string | undefined): value is ThemeValue {
  return value === "light" || value === "dark" || value === "system";
}

const THEME_ICONS = { light: Sun, dark: Moon, system: Monitor } satisfies Record<
  ThemeValue,
  typeof Sun
>;

const THEME_LABELS = { light: "Light", dark: "Dark", system: "System" } satisfies Record<
  ThemeValue,
  string
>;

export function ThemeToggle() {
  const { nav } = getMessages();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // next-themes resolves the persisted theme only after mount, so the trigger
  // icon falls back to "system" until then to avoid a hydration mismatch.
  useEffect(() => setMounted(true), []);

  const current: ThemeValue = mounted && isThemeValue(theme) ? theme : "system";
  const CurrentIcon = THEME_ICONS[current];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="secondary" className="gap-2" aria-label={nav.themeToggleLabel}>
          <CurrentIcon className="size-4" />
          <ChevronDown className="size-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-36 p-1">
        {THEME_VALUES.map((value) => {
          const Icon = THEME_ICONS[value];
          const selected = value === current;
          return (
            <button
              key={value}
              type="button"
              onClick={() => {
                setTheme(value);
                setOpen(false);
              }}
              className="hover:bg-accent hover:text-accent-foreground flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors"
            >
              <Icon className="size-4" />
              <span className="flex-1 text-left">{THEME_LABELS[value]}</span>
              {selected && <Check className="size-4 opacity-70" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
