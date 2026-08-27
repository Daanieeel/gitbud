import { useMemo, useState, type ReactNode } from "react";
import { ChevronDownIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Input } from "./input";
import { Checkbox } from "./checkbox";
import { Button } from "./button";
import { cn } from "../../lib/utils";

export interface LogoMultiSelectOption {
  value: string;
  label: string;
  icon?: ReactNode;
}

export interface LogoMultiSelectGroup {
  label: string;
  options: LogoMultiSelectOption[];
}

interface LogoMultiSelectProps {
  groups: LogoMultiSelectGroup[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
}

/** Popover-hosted checkbox list of logo-led options, grouped under headers (e.g. Languages,
 * Frameworks) with a search box to cut through a long catalog. Built for the .gitignore template
 * builder, but generic over `groups`/`selected` so anything picking several items out of a
 * logo-bearing catalog (license, CI provider, ...) can reuse it. */
export function LogoMultiSelect({
  groups,
  selected,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  className,
}: LogoMultiSelectProps) {
  const [query, setQuery] = useState("");

  const filteredGroups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return groups;
    return groups
      .map((group) => ({
        ...group,
        options: group.options.filter((o) => o.label.toLowerCase().includes(needle)),
      }))
      .filter((group) => group.options.length > 0);
  }, [groups, query]);

  const selectedSet = new Set(selected);
  const toggle = (value: string) => {
    onChange(selectedSet.has(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm" className={cn("justify-between", className)}>
          <span className="truncate">
            {selected.length > 0 ? `${selected.length} selected` : placeholder}
          </span>
          <ChevronDownIcon className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0">
        <div className="border-b border-border p-1.5">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="h-7"
          />
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          {filteredGroups.length === 0 && (
            <div className="p-2 text-center text-xs text-muted-foreground">No matches</div>
          )}
          {filteredGroups.map((group) => (
            <div key={group.label} className="mb-1 last:mb-0">
              <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                {group.label}
              </div>
              {group.options.map((option) => (
                <div
                  key={option.value}
                  role="option"
                  aria-selected={selectedSet.has(option.value)}
                  onClick={() => toggle(option.value)}
                  className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                >
                  <Checkbox checked={selectedSet.has(option.value)} className="pointer-events-none" />
                  {option.icon}
                  <span className="truncate">{option.label}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
