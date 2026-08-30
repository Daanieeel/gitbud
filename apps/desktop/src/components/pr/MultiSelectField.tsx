import { useState } from "react";
import { ChevronDownIcon, XIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@gitbud/ui/popover";
import { Input } from "@gitbud/ui/input";
import { CheckboxGroup } from "@gitbud/ui/checkbox-group";

export interface MultiSelectOption {
  key: string;
  label: React.ReactNode;
  searchText?: string;
  slotLeft?: React.ReactNode;
  slotRight?: React.ReactNode;
}

interface MultiSelectFieldProps {
  label: string;
  placeholder?: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
  /** Skips rendering the selected items as chips in the trigger button itself — for a caller
   * that already renders the current selection its own way elsewhere (e.g. the sidebar's
   * reviewer list, which shows each person with their own approve/pending status icon) and just
   * wants this as the "add/remove" control, not a second redundant display of the same names. */
  hideChips?: boolean;
}

/** A filterable checkbox list behind a chip-showing trigger button used for picking labels,
 * assignees, reviewers, and projects. */
export function MultiSelectField({
  label,
  placeholder,
  options,
  selected,
  onChange,
  hideChips,
}: MultiSelectFieldProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");

  const filtered = options.filter((o) => {
    const text = o.searchText ?? o.key;
    return (
      text.toLowerCase().includes(filter.toLowerCase()) ||
      o.key.toLowerCase().includes(filter.toLowerCase())
    );
  });

  const toggle = (key: string) => {
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex min-h-7 w-full flex-wrap items-center gap-1 rounded-md border border-input bg-accent px-2 py-1 text-left text-sm hover:bg-accent/80 hover:text-accent-foreground"
          >
            {selected.length === 0 || hideChips ? (
              <span className="text-muted-foreground">{placeholder ?? "None"}</span>
            ) : (
              selected.map((key) => {
                const opt = options.find((o) => o.key === key);
                return (
                  <span
                    key={key}
                    className="flex max-w-full items-center gap-1.5 truncate rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground"
                  >
                    {opt?.slotLeft && (
                      <span className="flex shrink-0 items-center">{opt.slotLeft}</span>
                    )}
                    <span className="min-w-0 truncate">{opt?.label ?? key}</span>
                    {opt?.slotRight && (
                      <span className="flex shrink-0 items-center text-muted-foreground">
                        {opt.slotRight}
                      </span>
                    )}
                    <XIcon
                      className="size-3 shrink-0 hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(key);
                      }}
                    />
                  </span>
                );
              })
            )}
            <ChevronDownIcon className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-1">
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
            {filtered.length === 0 && (
              <div className="p-2 text-center text-xs text-muted-foreground">No matches</div>
            )}
            {filtered.map((o) => (
              <CheckboxGroup
                key={o.key}
                className="rounded-sm px-2 py-1 text-sm hover:bg-accent"
                checked={selected.includes(o.key)}
                onCheckedChange={() => toggle(o.key)}
              >
                <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5 truncate">
                    {o.slotLeft && <span className="flex shrink-0 items-center">{o.slotLeft}</span>}
                    <span className="min-w-0 truncate">{o.label}</span>
                  </div>
                  {o.slotRight && (
                    <span className="flex shrink-0 items-center text-xs text-muted-foreground">
                      {o.slotRight}
                    </span>
                  )}
                </div>
              </CheckboxGroup>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
