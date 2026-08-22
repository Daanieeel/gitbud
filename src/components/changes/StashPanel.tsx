import { useEffect, useState } from "react";
import { ArchiveIcon, ExpandIcon, Trash2Icon, Undo2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DiffView } from "@/components/diff/DiffView";
import { api } from "@/lib/tauri";
import { useRepoStore } from "@/store/useRepoStore";
import { useStashStore } from "@/store/useStashStore";
import { cn } from "@/lib/utils";
import { FileTypeIcon } from "@/lib/file-icons";
import { ResizeHandle } from "@/components/layout/ResizeHandle";
import { useResizableWidth } from "@/hooks/useResizableWidth";
import type { FileDiff } from "@/lib/types";

interface StashPanelProps {
  hasChanges: boolean;
}

/** Turns git's raw stash message — "WIP on <branch>: <oid> <subject>" for an unlabeled
 * stash, or "On <branch>: <label>" for one saved with a custom message — into its branch and
 * description parts, so the UI isn't just displaying a run-on string of words. `branch` is
 * null if the message doesn't match either shape (e.g. an older/foreign stash format), in
 * which case `description` is the raw message untouched. */
function parseStashMessage(message: string): { branch: string | null; description: string } {
  const wip = message.match(/^WIP on (.+): [0-9a-f]{4,40} (.*)$/);
  if (wip) return { branch: wip[1], description: wip[2] };
  const labeled = message.match(/^On (.+): (.*)$/);
  if (labeled) return { branch: labeled[1], description: labeled[2] };
  return { branch: null, description: message };
}

// Same git2 Delta status names getCommitFiles returns for the History tab (a stash is just
// a commit under the hood), so the same status-color mapping applies here.
const STASH_STATUS_DOT_COLOR: Record<string, string> = {
  Added: "bg-accent-green",
  Untracked: "bg-accent-green",
  Copied: "bg-accent-green",
  Modified: "bg-accent-green",
  Deleted: "bg-accent-pink",
  Renamed: "bg-muted-foreground",
  Typechange: "bg-muted-foreground",
  Conflicted: "bg-destructive",
};

function StashDetail({ repoPath, index }: { repoPath: string; index: number }) {
  const refreshStatus = useRepoStore((s) => s.refreshStatus);
  const [files, setFiles] = useState<[string, string][]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [applyingPath, setApplyingPath] = useState<string | null>(null);
  const { width, onPointerDown } = useResizableWidth("panel-width:stash-files", 224, 160, 480);

  useEffect(() => {
    setSelectedPath(null);
    setDiff(null);
    void api
      .getStashOid(repoPath, index)
      .then((oid) => api.getCommitFiles(repoPath, oid))
      .then(setFiles);
  }, [repoPath, index]);

  useEffect(() => {
    if (!selectedPath) {
      setDiff(null);
      return;
    }
    void api
      .getStashOid(repoPath, index)
      .then((oid) => api.getCommitFileDiff(repoPath, oid, selectedPath))
      .then(setDiff);
  }, [repoPath, index, selectedPath]);

  const applyFile = async (path: string) => {
    setApplyingPath(path);
    try {
      await api.stashApplyFile(repoPath, index, path);
      await refreshStatus();
    } finally {
      setApplyingPath(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1">
      <div style={{ width }} className="shrink-0 overflow-auto">
        {files.length === 0 && (
          <div className="p-3 text-center text-sm text-muted-foreground">No files</div>
        )}
        {files.map(([path, status]) => (
          <div
            key={path}
            className={cn(
              "group flex items-center gap-1.5 px-2 py-1 text-sm hover:bg-accent",
              selectedPath === path && "bg-accent",
            )}
          >
            <span
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 truncate"
              title={`${path} (${status})`}
              onClick={() => setSelectedPath(path)}
            >
              <span className="relative shrink-0">
                <FileTypeIcon path={path} className="size-3.5" />
                <span
                  className={cn(
                    "absolute -right-0.5 -bottom-0.5 size-1.5 rounded-full ring-1 ring-background",
                    STASH_STATUS_DOT_COLOR[status] ?? "bg-muted-foreground",
                  )}
                />
              </span>
              <span className="truncate">{path}</span>
            </span>
            <button
              title="Restore this file from the stash, without popping it"
              className={cn(
                "shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-50",
                selectedPath === path ? "opacity-100" : "opacity-0 group-hover:opacity-100",
              )}
              disabled={applyingPath === path}
              onClick={() => void applyFile(path)}
            >
              <Undo2Icon className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
      <ResizeHandle onPointerDown={onPointerDown} />
      <div className="min-w-0 flex-1">
        <DiffView path={selectedPath} diff={diff} />
      </div>
    </div>
  );
}

export function StashPanel({ hasChanges }: StashPanelProps) {
  const repoPath = useRepoStore((s) => s.selectedRepo);
  const refreshStatus = useRepoStore((s) => s.refreshStatus);
  const stashes = useStashStore((s) => s.stashes);
  const load = useStashStore((s) => s.load);
  const save = useStashStore((s) => s.save);
  const apply = useStashStore((s) => s.apply);
  const pop = useStashStore((s) => s.pop);
  const drop = useStashStore((s) => s.drop);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailIndex, setDetailIndex] = useState<number | null>(null);

  useEffect(() => {
    if (open && repoPath) void load(repoPath);
  }, [open, repoPath, load]);

  if (!repoPath) return null;

  const doSave = async () => {
    setSaving(true);
    try {
      await save(repoPath, "", true);
      await refreshStatus();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" title="Stash uncommitted changes, or apply a saved stash">
            <ArchiveIcon className="size-3.5" />
            Stash{stashes.length > 0 ? ` (${stashes.length})` : ""}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <div className="border-b border-border p-2">
            <Button
              size="sm"
              variant="secondary"
              className="h-7 w-full text-xs"
              disabled={!hasChanges || saving}
              onClick={() => void doSave()}
            >
              <ArchiveIcon className="size-3.5" />
              Stash All Changes
            </Button>
          </div>
          <div className="max-h-64 overflow-auto p-1">
            {stashes.length === 0 && (
              <div className="p-3 text-center text-sm text-muted-foreground">No stashes</div>
            )}
            {stashes.map((s) => {
              const { branch, description } = parseStashMessage(s.message);
              return (
              <div
                key={s.index}
                className="group flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
                onClick={() => {
                  setDetailIndex(s.index);
                  setDetailOpen(true);
                  setOpen(false);
                }}
              >
                <span className="min-w-0 flex-1 truncate" title={s.message}>
                  {description}
                  {branch && <span className="ml-1.5 text-xs text-muted-foreground">on {branch}</span>}
                </span>
                <button
                  title="View files & diff"
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDetailIndex(s.index);
                    setDetailOpen(true);
                    setOpen(false);
                  }}
                >
                  <ExpandIcon className="size-3.5" />
                </button>
                <button
                  title="Apply (keep stash)"
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    void apply(repoPath, s.index).then(() => refreshStatus());
                  }}
                >
                  <Undo2Icon className="size-3.5" />
                </button>
                <button
                  title="Pop (apply and remove)"
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    void pop(repoPath, s.index).then(() => refreshStatus());
                  }}
                >
                  <ArchiveIcon className="size-3.5" />
                </button>
                <button
                  title="Drop"
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    void drop(repoPath, s.index);
                  }}
                >
                  <Trash2Icon className="size-3.5" />
                </button>
              </div>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="flex h-[70vh] max-w-5xl flex-col">
          <DialogHeader>
            <DialogTitle>
              {(() => {
                const message = detailIndex !== null
                  ? stashes.find((s) => s.index === detailIndex)?.message
                  : null;
                if (!message) return "";
                const { branch, description } = parseStashMessage(message);
                return branch ? `${description} (stashed on ${branch})` : description;
              })()}
            </DialogTitle>
          </DialogHeader>
          {repoPath && detailIndex !== null && <StashDetail repoPath={repoPath} index={detailIndex} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
