import { useEffect, useState } from "react";
import { FolderOpenIcon, FolderTreeIcon, LockIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/tauri";
import { useRepoStore } from "@/store/useRepoStore";
import { cn } from "@/lib/utils";
import type { WorktreeInfo } from "@/lib/types";

export function WorktreesPanel() {
  const repoPath = useRepoStore((s) => s.selectedRepo);
  const branches = useRepoStore((s) => s.branches);
  const addExistingRepo = useRepoStore((s) => s.addExistingRepo);
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [actionPath, setActionPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [confirmForcePath, setConfirmForcePath] = useState<string | null>(null);

  const [path, setPath] = useState("");
  const [mode, setMode] = useState<"existing" | "new">("new");
  const [existingBranch, setExistingBranch] = useState("");
  const [newBranch, setNewBranch] = useState("");

  const localBranches = branches.filter((b) => !b.is_remote);

  const refresh = () => {
    if (!repoPath) return;
    void api.listWorktrees(repoPath).then(setWorktrees);
  };

  useEffect(() => {
    refresh();
    setExistingBranch(localBranches[0]?.name ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoPath]);

  if (!repoPath) return null;

  const pickFolder = async () => {
    const dir = await open({ directory: true, title: "Choose a folder for the new worktree" });
    if (typeof dir === "string") setPath(dir);
  };

  const create = async () => {
    const branch = mode === "new" ? newBranch.trim() : existingBranch;
    if (!path.trim() || !branch) return;
    setBusy(true);
    setError(null);
    try {
      await api.addWorktree(repoPath, path.trim(), branch, mode === "new");
      setPath("");
      setNewBranch("");
      setShowForm(false);
      refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const openWorktree = async (wt: WorktreeInfo) => {
    setActionPath(wt.path);
    const startedAt = Date.now();
    try {
      await addExistingRepo(wt.path);
    } finally {
      const elapsed = Date.now() - startedAt;
      if (elapsed < 400) await new Promise((resolve) => setTimeout(resolve, 400 - elapsed));
      setActionPath(null);
    }
  };

  const removeOne = async (wt: WorktreeInfo, force: boolean) => {
    setActionPath(wt.path);
    setError(null);
    try {
      await api.removeWorktree(repoPath, wt.path, force);
      setConfirmForcePath(null);
      refresh();
    } catch (e) {
      if (!force) {
        setConfirmForcePath(wt.path);
        setError(`${String(e)} — it likely has uncommitted changes.`);
      } else {
        setError(String(e));
      }
    } finally {
      setActionPath(null);
    }
  };

  const extra = worktrees.filter((w) => !w.is_main);

  return (
    <Popover onOpenChange={(o) => o && refresh()}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="secondary" size="sm">
              <FolderTreeIcon className="size-3.5" />
              Worktrees{extra.length > 0 ? ` (${extra.length})` : ""}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>
          Worktrees — check out another branch into its own folder, side by side with this one
        </TooltipContent>
      </Tooltip>
      <PopoverContent className="w-96 p-0" align="start">
        <div className="border-b border-border p-2 text-xs text-muted-foreground">
          A worktree checks out a branch into its own folder, so you can work on it without
          disturbing what's currently checked out here. Great for reviewing a PR or hotfixing
          without stashing.
        </div>
        <div className="max-h-56 overflow-auto p-1">
          {worktrees.map((wt) => (
            <div key={wt.path} className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm">
              <FolderTreeIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate">{wt.branch ?? wt.name}</div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="truncate text-xs text-muted-foreground">
                      {wt.path}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>{wt.path}</TooltipContent>
                </Tooltip>
              </div>
              {wt.is_locked && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <LockIcon className="size-3.5 shrink-0 text-accent-yellow" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Locked (won't be pruned)</TooltipContent>
                </Tooltip>
              )}
              {!wt.is_main && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy || actionPath !== null}
                        onClick={() => void openWorktree(wt)}
                      >
                        <FolderOpenIcon className={cn("size-3.5", actionPath === wt.path && "animate-spin")} />
                        {actionPath === wt.path ? "Opening…" : "Open"}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Open this worktree as its own repo in the sidebar</TooltipContent>
                  </Tooltip>
                  {confirmForcePath === wt.path ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busy || actionPath !== null}
                          onClick={() => void removeOne(wt, true)}
                        >
                          {actionPath === wt.path ? "Removing…" : "Force Remove"}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Discard uncommitted changes in this worktree and remove it anyway</TooltipContent>
                    </Tooltip>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          className="shrink-0 text-muted-foreground hover:text-destructive disabled:opacity-50"
                          disabled={busy || actionPath !== null}
                          onClick={() => void removeOne(wt, false)}
                        >
                          <Trash2Icon className={cn("size-3.5", actionPath === wt.path && "animate-spin")} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Remove worktree</TooltipContent>
                    </Tooltip>
                  )}
                </>
              )}
              {wt.is_main && (
                <span className="shrink-0 text-xs text-muted-foreground">current checkout</span>
              )}
            </div>
          ))}
        </div>
        {error && <p className="px-2 pb-1 text-xs text-destructive">{error}</p>}
        <div className="border-t border-border p-2">
          {!showForm ? (
            <Button size="sm" className="w-full" onClick={() => setShowForm(true)}>
              <PlusIcon className="size-3.5" />
              New Worktree…
            </Button>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Input
                  placeholder="Folder for the new worktree"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  className="h-7"
                />
                <Button type="button" size="sm" variant="secondary" onClick={() => void pickFolder()}>
                  <FolderOpenIcon className="size-3.5" />
                </Button>
              </div>
              <div className="flex gap-3 text-xs">
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    checked={mode === "new"}
                    onChange={() => setMode("new")}
                  />
                  New branch
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    checked={mode === "existing"}
                    onChange={() => setMode("existing")}
                  />
                  Existing branch
                </label>
              </div>
              {mode === "new" ? (
                <Input
                  placeholder="New branch name"
                  value={newBranch}
                  onChange={(e) => setNewBranch(e.target.value)}
                  className="h-7"
                />
              ) : (
                <select
                  value={existingBranch}
                  onChange={(e) => setExistingBranch(e.target.value)}
                  className="h-7 rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  {localBranches.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                </select>
              )}
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
                <Button size="sm" disabled={busy} onClick={() => void create()}>
                  {busy ? "Creating…" : "Create"}
                </Button>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
