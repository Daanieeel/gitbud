import { useMemo, useState } from "react";
import { ChevronsUpDownIcon, GitBranchIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useRepoStore } from "@/store/useRepoStore";
import { cn } from "@/lib/utils";

export function BranchSwitcher() {
  const branch = useRepoStore((s) => s.branch);
  const branches = useRepoStore((s) => s.branches);
  const checkoutBranch = useRepoStore((s) => s.checkoutBranch);
  const createBranch = useRepoStore((s) => s.createBranch);
  const selectedRepo = useRepoStore((s) => s.selectedRepo);

  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");

  const local = useMemo(
    () => branches.filter((b) => !b.is_remote && b.name.toLowerCase().includes(filter.toLowerCase())),
    [branches, filter],
  );

  const exactMatch = branches.some((b) => !b.is_remote && b.name === filter.trim());
  const canCreate = filter.trim().length > 0 && !exactMatch;

  if (!selectedRepo) {
    return (
      <Button variant="outline" className="w-48 justify-between" disabled>
        <span className="flex items-center gap-2 text-muted-foreground">
          <GitBranchIcon className="size-4" /> No repository
        </span>
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-48 justify-between">
          <span className="flex min-w-0 items-center gap-2">
            <GitBranchIcon className="size-4 shrink-0" />
            <span className="truncate">{branch ?? "…"}</span>
          </span>
          <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0">
        <div className="border-b border-border p-2">
          <Input
            autoFocus
            placeholder="Find or create branch"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-7"
          />
        </div>
        <div className="max-h-64 overflow-auto p-1">
          {local.map((b) => (
            <div
              key={b.name}
              className={cn(
                "flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent",
                b.is_head && "bg-accent",
              )}
              onClick={() => {
                void checkoutBranch(b.name);
                setOpen(false);
              }}
            >
              <span className="truncate">{b.name}</span>
            </div>
          ))}
          {canCreate && (
            <div
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-primary hover:bg-accent"
              onClick={() => {
                void createBranch(filter.trim(), true);
                setFilter("");
                setOpen(false);
              }}
            >
              <PlusIcon className="size-3.5" />
              <span className="truncate">Create branch "{filter.trim()}"</span>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
