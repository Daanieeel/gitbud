import { useMemo, useState } from "react";
import { ChevronsUpDownIcon, GitBranchIcon, PlusIcon, TriangleAlertIcon } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useRepoStore } from "@/store/useRepoStore";
import { cn, isProtectedBranch } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";
import { githubBranchUrl } from "@/lib/github-links";

export function BranchSwitcher() {
  const branch = useRepoStore((s) => s.branch);
  const branches = useRepoStore((s) => s.branches);
  const checkoutBranch = useRepoStore((s) => s.checkoutBranch);
  const createBranch = useRepoStore((s) => s.createBranch);
  const deleteBranch = useRepoStore((s) => s.deleteBranch);
  const renameBranch = useRepoStore((s) => s.renameBranch);
  const mergeBranch = useRepoStore((s) => s.mergeBranch);
  const selectedRepo = useRepoStore((s) => s.selectedRepo);

  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

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

  const commitRename = async () => {
    if (!renaming || !renameValue.trim() || renameValue.trim() === renaming) {
      setRenaming(null);
      return;
    }
    await renameBranch(renaming, renameValue.trim());
    setRenaming(null);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-48 justify-between" title="Switch or create a branch">
          <span className="flex min-w-0 items-center gap-2">
            <GitBranchIcon className="size-4 shrink-0" />
            <span className="truncate">{branch ?? "…"}</span>
            {branch && isProtectedBranch(branch) && (
              <span title={`${branch} is a protected default branch`}>
                <TriangleAlertIcon className="size-3.5 shrink-0 text-accent-yellow" />
              </span>
            )}
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
          {local.map((b) =>
            renaming === b.name ? (
              <Input
                key={b.name}
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => void commitRename()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void commitRename();
                  if (e.key === "Escape") setRenaming(null);
                }}
                className="h-7 my-0.5"
              />
            ) : (
              <ContextMenu key={b.name}>
                <ContextMenuTrigger asChild>
                  <div
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
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onSelect={() => void copyToClipboard(b.name)}>
                    Copy Name
                  </ContextMenuItem>
                  <ContextMenuItem
                    onSelect={() => {
                      if (!selectedRepo) return;
                      void githubBranchUrl(selectedRepo, b.name).then((url) => {
                        if (url) void openUrl(url);
                      });
                    }}
                  >
                    Open Branch on GitHub
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    disabled={b.is_head}
                    onSelect={() => {
                      setRenaming(b.name);
                      setRenameValue(b.name);
                    }}
                  >
                    Rename
                  </ContextMenuItem>
                  <ContextMenuItem
                    disabled={b.is_head}
                    onSelect={() => void mergeBranch(b.name)}
                  >
                    Merge into Current
                  </ContextMenuItem>
                  <ContextMenuItem
                    variant="destructive"
                    disabled={b.is_head}
                    onSelect={() => void deleteBranch(b.name)}
                  >
                    Delete
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ),
          )}
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
