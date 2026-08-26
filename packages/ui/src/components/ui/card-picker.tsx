import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";
import { cn } from "../../lib/utils";

interface CardPickerOption<T> {
  value: T;
  label: string;
  description: string;
  disabled?: boolean;
  disabledReason?: string;
}

/** A short title, a one-line description, a primary-tinted border when selected — and, when
 * disabled, a tooltip explaining why instead of the option just vanishing. */
export function CardPicker<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: CardPickerOption<T>[];
}) {
  return (
    <div className="flex gap-2">
      {options.map((o) => {
        const card = (
          <button
            key={o.value}
            type="button"
            // Not a real `disabled` attribute: that would block pointer events in most
            // browsers, silently preventing the tooltip below from ever showing on hover.
            aria-disabled={o.disabled}
            className={cn(
              "flex-1 rounded-md border border-border p-2 text-left",
              o.disabled && "cursor-not-allowed opacity-40",
              value === o.value && "border-2 border-primary bg-primary/10 p-[7px]",
            )}
            onClick={() => !o.disabled && onChange(o.value)}
          >
            <div className="flex flex-col gap-1">
              <div className="text-sm font-medium">{o.label}</div>
              <div className="text-xs text-muted-foreground">{o.description}</div>
            </div>
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
