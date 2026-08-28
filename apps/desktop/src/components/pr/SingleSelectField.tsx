import { useState } from "react";
import { CheckIcon, ChevronDownIcon, XIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@gitbud/ui/popover";
import { Input } from "@gitbud/ui/input";
import { cn } from "@gitbud/ui/utils";

export interface SingleSelectOption {
  key: string;
  label: React.ReactNode;
  searchText?: string;
}

interface SingleSelectFieldProps {
  label?: string;
  placeholder?: string;
  clearLabel?: string;
  clearable?: boolean;
  options: SingleSelectOption[];
  selected: string;
  onChange: (selected: string) => void;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
}

/** A filterable single-select list behind a trigger button, matching the popover UX of MultiSelectField. */
export function SingleSelectField({
  label,
  placeholder,
  clearLabel,
  clearable,
  options,
  selected,
  onChange,
  className,
  triggerClassName,
  contentClassName,
}: SingleSelectFieldProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");

  const canClear = clearable ?? Boolean(clearLabel);

  const filtered = options.filter((o) => {
    const text = o.searchText ?? o.key;
    return (
      text.toLowerCase().includes(filter.toLowerCase()) ||
      o.key.toLowerCase().includes(filter.toLowerCase())
    );
  });

  const selectedOption = options.find((o) => o.key === selected);

  return (
    <div className={cn(label && "flex flex-col gap-1", className)}>
      {label && <span className="text-xs font-medium text-muted-foreground">{label}</span>}
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setFilter("");
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex h-7 w-full min-w-0 max-w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-input bg-transparent px-2 text-left text-sm whitespace-nowrap hover:bg-accent focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-2 outline-none",
              triggerClassName,
            )}
          >
            <span className={cn("min-w-0 flex-1 truncate", !selected && "text-muted-foreground")}>
              {selected ? (selectedOption?.label ?? selected) : (placeholder ?? "None")}
            </span>
            <ChevronDownIcon className="size-3.5 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className={cn("w-56 p-1", contentClassName)}>
          <Input
            autoFocus
            placeholder="Filter…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="mb-1 h-7"
          />
          <div
            className="max-h-48 overflow-auto"
            // Portalled straight to `body`, a DOM sibling of the enclosing Dialog rather than a
            // descendant, so the Dialog's scroll lock (which only recognizes scrollable elements
            // nested inside its own content) swallows wheel events over it and native scrolling
            // silently does nothing. Scroll it manually instead of relying on that (same fix as
            // LogoMultiSelect/EditorPicker).
            onWheel={(e) => {
              // Manual scroll gets none of the browser's native deltaY damping, so it reads as
              // too fast at 1:1 - scale it down to roughly match native trackpad/wheel feel.
              e.currentTarget.scrollTop += e.deltaY * 0.5;
              e.stopPropagation();
            }}
          >
            {canClear && selected && (
              <button
                type="button"
                className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                <XIcon className="size-3 shrink-0" />
                <span>{clearLabel ?? "Clear selection"}</span>
              </button>
            )}
            {filtered.length === 0 && (
              <div className="p-2 text-center text-xs text-muted-foreground">No matches</div>
            )}
            {filtered.map((o) => {
              const isSelected = selected === o.key;
              return (
                <button
                  key={o.key}
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1 text-sm hover:bg-accent",
                    isSelected && "bg-accent/50 font-medium",
                  )}
                  onClick={() => {
                    onChange(isSelected && canClear ? "" : o.key);
                    setOpen(false);
                  }}
                >
                  <span className="min-w-0 flex-1 truncate text-left">{o.label}</span>
                  {isSelected && <CheckIcon className="size-3.5 shrink-0 text-primary" />}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
