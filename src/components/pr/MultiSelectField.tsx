import { useState } from "react";
import { ChevronDownIcon, XIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { CheckboxGroup } from "@/components/ui/checkbox-group";

export interface MultiSelectOption {
  key: string;
  label: React.ReactNode;
}

interface MultiSelectFieldProps {
  label: string;
  placeholder?: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (selected: string[]) => void;
}

/** A filterable checkbox list behind a chip-showing trigger button — used for picking labels,
 * assignees, and reviewers, none of which have a native `<select>` equivalent since more than
 * one can be chosen at once. */
export function MultiSelectField({ label, placeholder, options, selected, onChange }: MultiSelectFieldProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");

  const filtered = options.filter((o) => o.key.toLowerCase().includes(filter.toLowerCase()));

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
            className="flex min-h-7 w-full flex-wrap items-center gap-1 rounded-md border border-input bg-transparent px-2 py-1 text-left text-sm hover:bg-accent"
          >
            {selected.length === 0 ? (
              <span className="text-muted-foreground">{placeholder ?? "None"}</span>
            ) : (
              selected.map((key) => {
                const opt = options.find((o) => o.key === key);
                return (
                  <span
                    key={key}
                    className="flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground"
                  >
                    {opt?.label ?? key}
                    <XIcon
                      className="size-3 hover:text-destructive"
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
          <div className="max-h-48 overflow-auto">
            {filtered.length === 0 && <div className="p-2 text-center text-xs text-muted-foreground">No matches</div>}
            {filtered.map((o) => (
              <CheckboxGroup
                key={o.key}
                className="rounded-sm px-2 py-1 text-sm hover:bg-accent"
                checked={selected.includes(o.key)}
                onCheckedChange={() => toggle(o.key)}
              >
                {o.label}
              </CheckboxGroup>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
