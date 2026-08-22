import { useMemo, useState } from "react";
import {
  ChevronsUpDownIcon,
  CloudUploadIcon,
  CopyIcon,
  ExternalLinkIcon,
  GitBranchIcon,
  GitMergeIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  // A local branch with no matching origin/<name> remote branch has never been pushed —
  // labeled "local" so it stands out from regular (tracked) branches, which need no label.
  const remoteBranchNames = useMemo(
    () => new Set(branches.filter((b) => b.is_remote).map((b) => b.name)),
    [branches],
  );
  const isLocalOnly = (name: string) => !remoteBranchNames.has(`origin/${name}`);

  const exactMatch = branches.some((b) => !b.is_remote && b.name === filter.trim());
  const canCreate = filter.trim().length > 0 && !exactMatch;

  if (!selectedRepo) {
    return (
      <Button variant="secondary" className="w-48 justify-between" disabled>
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
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="secondary" className="w-48 justify-between">
              <span className="flex min-w-0 items-center gap-2">
                <GitBranchIcon className="size-4 shrink-0" />
                <span className="truncate">{branch ?? "…"}</span>
                {branch && isProtectedBranch(branch) && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <TriangleAlertIcon className="size-3.5 shrink-0 text-accent-yellow" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{`${branch} is a protected default branch`}</TooltipContent>
                  </Tooltip>
                )}
                {branch && isLocalOnly(branch) && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <CloudUploadIcon className="size-3.5 shrink-0 text-accent-blue" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{`${branch} has never been pushed`}</TooltipContent>
                  </Tooltip>
                )}
              </span>
              <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Switch or create a branch</TooltipContent>
      </Tooltip>
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
        <div className="flex max-h-64 flex-col gap-1 overflow-auto p-1">
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
                    <span className="min-w-0 flex-1 truncate">{b.name}</span>
                    {isLocalOnly(b.name) && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="shrink-0 rounded-full bg-accent-blue/10 px-1.5 py-0.5 text-[10px] font-medium text-accent-blue">
                            local
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{`${b.name} has never been pushed`}</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onSelect={() => void copyToClipboard(b.name)}>
                    <CopyIcon className="size-3.5" />
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
                    <ExternalLinkIcon className="size-3.5" />
                    Open Branch on GitHub
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem
                    onSelect={() => {
                      setRenaming(b.name);
                      setRenameValue(b.name);
                    }}
                  >
                    <PencilIcon className="size-3.5" />
                    Rename
                  </ContextMenuItem>
                  <ContextMenuItem
                    disabled={b.is_head}
                    onSelect={() => void mergeBranch(b.name)}
                  >
                    <GitMergeIcon className="size-3.5" />
                    Merge into Current
                  </ContextMenuItem>
                  <ContextMenuItem
                    variant="destructive"
                    disabled={b.is_head}
                    onSelect={() => void deleteBranch(b.name)}
                  >
                    <Trash2Icon className="size-3.5" />
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
