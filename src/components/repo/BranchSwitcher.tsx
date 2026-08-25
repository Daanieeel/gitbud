import { useEffect, useMemo, useRef, useState } from "react";
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
import { toast } from "sonner";
import { api } from "@/lib/tauri";
import { useStashSave, useStashPop } from "@/hooks/queries/useStashes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckboxGroup } from "@/components/ui/checkbox-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRepoStore } from "@/store/useRepoStore";
import {
  useBranches,
  useCheckoutBranch,
  useCreateBranch,
  useDeleteBranch,
  useMergeBranch,
  useRenameBranch,
} from "@/hooks/queries/useBranches";
import { useStatus } from "@/hooks/queries/useRepoStatus";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { cn, isProtectedBranch } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";
import { githubBranchUrl } from "@/lib/github-links";

export function BranchSwitcher() {
  const selectedRepo = useRepoStore((s) => s.selectedRepo);
  const queryClient = useQueryClient();
  const { data: branchData } = useBranches(selectedRepo);
  const branch = branchData?.branch ?? null;
  const branches = branchData?.branches ?? [];
  const { data: status } = useStatus(selectedRepo);
  const checkoutBranchMutation = useCheckoutBranch(selectedRepo);
  const createBranchMutation = useCreateBranch(selectedRepo);
  const deleteBranchMutation = useDeleteBranch(selectedRepo);
  const renameBranchMutation = useRenameBranch(selectedRepo);
  const mergeBranchMutation = useMergeBranch(selectedRepo);
  const stashSaveMutation = useStashSave(selectedRepo);
  const stashPopMutation = useStashPop(selectedRepo);

  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameRemote, setRenameRemote] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [renameBusy, setRenameBusy] = useState(false);
  const [pendingSwitch, setPendingSwitch] = useState<string | null>(null);
  const [switchChoice, setSwitchChoice] = useState<"leave" | "bring">("leave");
  const [pendingDelete, setPendingDelete] = useState<{
    name: string;
    uncommitted: boolean;
    unmerged: boolean;
    published: boolean;
  } | null>(null);
  const [deleteOnRemote, setDeleteOnRemote] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const handleOpenBranchSwitcher = () => setOpen(true);
    window.addEventListener("open-branch-switcher", handleOpenBranchSwitcher);
    return () => window.removeEventListener("open-branch-switcher", handleOpenBranchSwitcher);
  }, []);

  const local = useMemo(
    () => branches.filter((b) => !b.is_remote && b.name.toLowerCase().includes(filter.toLowerCase())),
    [branches, filter],
  );
  // Typing (or reopening) resets the keyboard highlight back to the top of the list rather
  // than leaving it wherever it was, matching standard combobox behavior.
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filter, open]);
  const highlightedRowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  useEffect(() => {
    highlightedRowRefs.current.get(highlightedIndex)?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);
  // Unfiltered (unlike `local`, above) — deciding whether delete should be disabled at all, or
  // which branch to fall back to, must not depend on whatever the user's typed into the search box.
  const allLocalBranches = useMemo(() => branches.filter((b) => !b.is_remote), [branches]);
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
      <Button variant="secondary" size="sm" className="w-48 justify-between" disabled>
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
    setRenameBusy(true);
    try {
      await renameBranchMutation.mutateAsync({ oldName: renaming, newName: renameValue.trim(), alsoRenameRemote: renameRemote });
    } finally {
      setRenameBusy(false);
      setRenaming(null);
    }
  };

  const runCheckout = async (name: string) => {
    setOpen(false);
    setSwitching(true);
    const startedAt = Date.now();
    try {
      await checkoutBranchMutation.mutateAsync(name);
    } catch (err) {
      toast.error(String(err));
    } finally {
      const elapsed = Date.now() - startedAt;
      if (elapsed < 400) await new Promise((resolve) => setTimeout(resolve, 400 - elapsed));
      setSwitching(false);
    }
  };

  const doCheckout = (name: string) => {
    if (name === branch) {
      setOpen(false);
      return;
    }
    if ((status?.files.length ?? 0) > 0) {
      setOpen(false);
      setSwitchChoice("leave");
      setPendingSwitch(name);
      return;
    }
    void runCheckout(name);
  };

  const confirmSwitch = async () => {
    if (!pendingSwitch || !selectedRepo || !branch) return;
    const target = pendingSwitch;
    const bringChanges = switchChoice === "bring";
    setSwitching(true);
    const startedAt = Date.now();
    try {
      await stashSaveMutation.mutateAsync({ message: `WIP on ${branch} before switching to ${target}`, includeUntracked: true });
      await checkoutBranchMutation.mutateAsync(target);
      if (bringChanges) await stashPopMutation.mutateAsync(0);
    } catch (err) {
      toast.error(String(err));
    } finally {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.status(selectedRepo) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.stashes(selectedRepo) }),
      ]);
      const elapsed = Date.now() - startedAt;
      if (elapsed < 400) await new Promise((resolve) => setTimeout(resolve, 400 - elapsed));
      setSwitching(false);
      setPendingSwitch(null);
    }
  };

  // Deletes right away when nothing's at risk (no uncommitted changes on it, fully merged,
  // never pushed); otherwise opens the confirmation dialog with whichever of those is true.
  const requestDelete = async (name: string) => {
    const published = !isLocalOnly(name);
    const uncommitted = name === branch && (status?.files.length ?? 0) > 0;
    const target =
      allLocalBranches.find((b) => b.name !== name && (b.name === "main" || b.name === "master"))?.name ??
      allLocalBranches.find((b) => b.name !== name)?.name;
    // No other branch to compare against shouldn't happen (delete is disabled when this is the
    // only local branch) — but if it somehow does, err conservative and treat as unmerged.
    const unmerged = !target || !(selectedRepo && (await api.isBranchMerged(selectedRepo, name, target).catch(() => false)));

    if (!published && !uncommitted && !unmerged) {
      deleteBranchMutation.mutate({ name });
      return;
    }
    setDeleteOnRemote(false);
    setPendingDelete({ name, uncommitted, unmerged, published });
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteBranchMutation.mutateAsync({
        name: pendingDelete.name,
        opts: { deleteRemote: pendingDelete.published && deleteOnRemote },
      });
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };

  const doCreate = async (name: string) => {
    setFilter("");
    setOpen(false);
    setSwitching(true);
    const startedAt = Date.now();
    try {
      await createBranchMutation.mutateAsync({ name, checkout: true });
    } finally {
      const elapsed = Date.now() - startedAt;
      if (elapsed < 400) await new Promise((resolve) => setTimeout(resolve, 400 - elapsed));
      setSwitching(false);
    }
  };

  return (
    <>
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="secondary" size="sm" className="w-48 justify-between" disabled={switching}>
              <span className="flex min-w-0 items-center gap-2">
                <GitBranchIcon className={cn("size-4 shrink-0", switching && "animate-spin")} />
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
            autoComplete="off"
            placeholder="Find or create branch"
            value={filter}
            onChange={(e) => setFilter(e.target.value.replace(/\s/g, "-"))}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                const lastIndex = local.length - 1;
                if (lastIndex < 0) return;
                setHighlightedIndex((i) =>
                  e.key === "ArrowDown" ? Math.min(i + 1, lastIndex) : Math.max(i - 1, 0),
                );
                return;
              }
              if (e.key !== "Enter") return;
              const highlighted = local[highlightedIndex];
              if (highlighted) void doCheckout(highlighted.name);
              else if (canCreate) void doCreate(filter.trim());
            }}
            className="h-7"
          />
        </div>
        <div className="flex max-h-64 flex-col gap-1 overflow-auto p-1">
          {local.map((b, index) => (
              <ContextMenu key={b.name}>
                <ContextMenuTrigger asChild>
                  <div
                    ref={(el) => {
                      if (el) highlightedRowRefs.current.set(index, el);
                      else highlightedRowRefs.current.delete(index);
                    }}
                    className={cn(
                      "flex cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent",
                      b.is_head && "bg-accent",
                      index === highlightedIndex && "ring-1 ring-inset ring-primary",
                    )}
                    onClick={() => void doCheckout(b.name)}
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
                      setRenameRemote(false);
                    }}
                  >
                    <PencilIcon className="size-3.5" />
                    Rename
                  </ContextMenuItem>
                  <ContextMenuItem
                    disabled={b.is_head}
                    onSelect={() => mergeBranchMutation.mutate(b.name)}
                  >
                    <GitMergeIcon className="size-3.5" />
                    Merge into Current
                  </ContextMenuItem>
                  <ContextMenuItem
                    variant="destructive"
                    disabled={allLocalBranches.length <= 1}
                    onSelect={() => void requestDelete(b.name)}
                  >
                    <Trash2Icon className="size-3.5" />
                    Delete
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
          ))}
          {canCreate && (
            <div
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
              onClick={() => void doCreate(filter.trim())}
            >
              <PlusIcon className="size-3.5" />
              <span className="truncate">Create branch "{filter.trim()}"</span>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
      <Dialog
        open={renaming !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setRenaming(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename "{renaming}"</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={renameBusy}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value.replace(/\s/g, "-"))}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commitRename();
            }}
          />
          {renaming && !isLocalOnly(renaming) && (
            <CheckboxGroup
              className="text-sm text-muted-foreground"
              checked={renameRemote}
              disabled={renameBusy}
              onCheckedChange={(checked) => setRenameRemote(checked === true)}
            >
              Rename on remote
            </CheckboxGroup>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button disabled={renameBusy || !renameValue.trim()} onClick={() => void commitRename()}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={pendingSwitch !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setPendingSwitch(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Switch Branch</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            You have changes on this branch. What would you like to do with them?
          </p>
          <div className="flex flex-col gap-2">
            <label
              className={cn(
                "flex cursor-pointer items-start gap-2 rounded-md border border-border p-3 text-sm",
                switchChoice === "leave" && "border-primary bg-accent",
              )}
            >
              <input
                type="radio"
                className="mt-0.5"
                checked={switchChoice === "leave"}
                onChange={() => setSwitchChoice("leave")}
              />
              <span>
                <span className="font-medium">Leave my changes on {branch}</span>
                <br />
                <span className="text-muted-foreground">
                  Your in-progress work will be stashed on this branch for you to return to later
                </span>
              </span>
            </label>
            <label
              className={cn(
                "flex cursor-pointer items-start gap-2 rounded-md border border-border p-3 text-sm",
                switchChoice === "bring" && "border-primary bg-accent",
              )}
            >
              <input
                type="radio"
                className="mt-0.5"
                checked={switchChoice === "bring"}
                onChange={() => setSwitchChoice("bring")}
              />
              <span>
                <span className="font-medium">Bring my changes to {pendingSwitch}</span>
                <br />
                <span className="text-muted-foreground">
                  Your in-progress work will follow you to the new branch
                </span>
              </span>
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingSwitch(null)}>
              Cancel
            </Button>
            <Button disabled={switching} onClick={() => void confirmSwitch()}>
              Switch Branch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setPendingDelete(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete "{pendingDelete?.name}"?</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {pendingDelete?.uncommitted && (
              <div className="flex items-start gap-2 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
                <span>You have uncommitted changes on this branch. They'll be lost.</span>
              </div>
            )}
            {pendingDelete?.unmerged && (
              <div className="flex items-start gap-2 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
                <span>This branch has commits not merged anywhere else</span>
              </div>
            )}
            {pendingDelete?.published && (
              <div className="flex items-start gap-2 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
                <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
                <span>This branch is published to origin</span>
              </div>
            )}
          </div>
          {pendingDelete?.published && (
            <CheckboxGroup
              className="text-sm text-muted-foreground"
              variant="destructive"
              checked={deleteOnRemote}
              onCheckedChange={(checked) => setDeleteOnRemote(checked === true)}
            >
              Delete on remote
            </CheckboxGroup>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={deleting} onClick={() => void confirmDelete()}>
              Delete Branch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
