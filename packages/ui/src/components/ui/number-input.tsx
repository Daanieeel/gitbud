import { MinusIcon, PlusIcon } from "lucide-react";
import { cn } from "../../lib/utils";

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}

/** A stepper control styled like a `Button` `variant="secondary"` (same border/background),
 * split into a decrement button, a centered (and directly editable — click in and type) value,
 * and an increment button — for a short bounded numeric setting (e.g. a font size) where a
 * couple of clicks is usually enough, without losing the ability to just type an exact value. */
export function NumberInput({ value, onChange, min, max, step = 1, className }: NumberInputProps) {
  const clamp = (next: number) => {
    let clamped = next;
    if (min !== undefined) clamped = Math.max(min, clamped);
    if (max !== undefined) clamped = Math.min(max, clamped);
    return clamped;
  };
  const atMin = min !== undefined && value <= min;
  const atMax = max !== undefined && value >= max;

  return (
    <div
      className={cn(
        "inline-flex h-8 items-stretch overflow-hidden rounded-md border border-input bg-accent text-xs",
        className,
      )}
    >
      <button
        type="button"
        disabled={atMin}
        onClick={() => onChange(clamp(value - step))}
        className="flex w-8 shrink-0 items-center justify-center text-muted-foreground hover:bg-accent/80 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      >
        <MinusIcon className="size-3.5" />
      </button>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (!Number.isNaN(next)) onChange(clamp(next));
        }}
        className="min-w-8 flex-1 border-x border-input bg-transparent px-2 text-center tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        disabled={atMax}
        onClick={() => onChange(clamp(value + step))}
        className="flex w-8 shrink-0 items-center justify-center text-muted-foreground hover:bg-accent/80 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
      >
        <PlusIcon className="size-3.5" />
      </button>
    </div>
  );
}
