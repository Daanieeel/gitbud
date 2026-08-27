import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

interface ProviderPickerOption<T extends string> {
  value: T;
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  disabledReason?: string;
}

/** Icon-led card row for picking a git provider (GitHub/GitLab/Bitbucket/Custom, ...) — compact
 * and icon-led rather than description-led, so several providers fit comfortably in one row.
 * Generic over the value type so callers keep their own provider union instead of this package
 * needing to know about it. */
export function ProviderPicker<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: ProviderPickerOption<T>[];
}) {
  return (
    <div className="flex gap-2">
      {options.map((o) => {
        const card = (
          <button
            key={o.value}
            type="button"
            aria-disabled={o.disabled}
            onClick={() => !o.disabled && onChange(o.value)}
            className={cn(
              "flex flex-1 flex-col items-center gap-1.5 rounded-md border border-border p-2",
              o.disabled && "cursor-not-allowed opacity-40",
              value === o.value && "border-2 border-primary bg-primary/10 p-[7px]",
            )}
          >
            {o.icon}
            <span className="text-xs font-medium">{o.label}</span>
          </button>
        );
        if (!o.disabled || !o.disabledReason) return card;
        return (
          <Tooltip key={o.value}>
            <TooltipTrigger asChild>{card}</TooltipTrigger>
            <TooltipContent>{o.disabledReason}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
