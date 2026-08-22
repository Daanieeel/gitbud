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
import type { FileDiff } from "@/lib/types";

interface StashPanelProps {
  hasChanges: boolean;
}

function StashDetail({ repoPath, index }: { repoPath: string; index: number }) {
  const refreshStatus = useRepoStore((s) => s.refreshStatus);
  const [files, setFiles] = useState<[string, string][]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [diff, setDiff] = useState<FileDiff | null>(null);
  const [applyingPath, setApplyingPath] = useState<string | null>(null);

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
      <div className="w-56 shrink-0 overflow-auto border-r border-border">
        {files.length === 0 && (
          <div className="p-3 text-center text-sm text-muted-foreground">No files</div>
        )}
        {files.map(([path, status]) => (
          <div
            key={path}
            className={cn(
              "group flex items-center gap-1 px-2 py-1 text-sm hover:bg-accent",
              selectedPath === path && "bg-accent",
            )}
          >
            <span
              className="min-w-0 flex-1 cursor-pointer truncate"
              title={`${path} (${status})`}
              onClick={() => setSelectedPath(path)}
            >
              {path}
            </span>
            <button
              title="Restore this file from the stash, without popping it"
              className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground disabled:opacity-50"
              disabled={applyingPath === path}
              onClick={() => void applyFile(path)}
            >
              <Undo2Icon className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
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
              className="w-full"
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
            {stashes.map((s) => (
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
                  {s.message}
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
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="flex h-[70vh] max-w-5xl flex-col">
          <DialogHeader>
            <DialogTitle>
              {detailIndex !== null ? stashes.find((s) => s.index === detailIndex)?.message : ""}
            </DialogTitle>
          </DialogHeader>
          {repoPath && detailIndex !== null && <StashDetail repoPath={repoPath} index={detailIndex} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
