import { useEffect, useMemo, useRef, useState } from "react";
import { ArchiveIcon, ExpandIcon, Trash2Icon, Undo2Icon } from "lucide-react";
import { Button } from "@gitbud/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@gitbud/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@gitbud/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gitbud/ui/tooltip";
import { DiffView } from "@gitbud/ui/diff-view";
import { useRepoStore } from "@/store/useRepoStore";
import {
  useStashApply,
  useStashApplyFile,
  useStashDrop,
  useStashFileDiff,
  useStashFiles,
  useStashPop,
  useStashSave,
  useStashes,
} from "@/hooks/queries/useStashes";
import { cn } from "@gitbud/ui/utils";
import { FileTypeIcon } from "@/lib/file-icons";
import { FileStatusIcon } from "@/lib/file-status";
import { FilePathLabel } from "./FilePathLabel";
import { GenericFileMenuItems } from "./GenericFileMenuItems";
import { ResizeHandle } from "@/components/layout/ResizeHandle";
import { useResizableWidth } from "@/hooks/useResizableWidth";
import { useArrowKeyFileNav } from "@/hooks/useArrowKeyFileNav";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@gitbud/ui/context-menu";

interface StashPanelProps {
  hasChanges: boolean;
}

/** Turns git's raw stash message — "WIP on <branch>: <oid> <subject>" for an unlabeled
 * stash, or "On <branch>: <label>" for one saved with a custom message — into its branch and
 * description parts, so the UI isn't just displaying a run-on string of words. `branch` is
 * null if the message doesn't match either shape (e.g. an older/foreign stash format), in
 * which case `description` is the raw message untouched. */
function parseStashMessage(message: string) {
  const wip = message.match(/^WIP on (.+): [0-9a-f]{4,40} (.*)$/);
  if (wip) return { branch: wip[1], description: wip[2] };
  const labeled = message.match(/^On (.+): (.*)$/);
  if (labeled) return { branch: labeled[1], description: labeled[2] };
  return { branch: null, description: message };
}

function StashDetail({ repoPath, index }: { repoPath: string; index: number }) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [applyingPath, setApplyingPath] = useState<string | null>(null);
  const { width, onPointerDown } = useResizableWidth("panel-width:stash-files", 224, 160, 480);
  const { data: files = [] } = useStashFiles(repoPath, index);
  const { data: diff = null } = useStashFileDiff(repoPath, index, selectedPath);
  const applyFileMutation = useStashApplyFile(repoPath);
  const filePaths = useMemo(() => files.map(([path]) => path), [files]);
  const handleArrowNav = useArrowKeyFileNav(filePaths, selectedPath, setSelectedPath);
  const fileListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedPath(null);
  }, [repoPath, index]);

  useEffect(() => {
    fileListRef.current?.focus();
  }, [repoPath, index]);

  const applyFile = async (path: string) => {
    setApplyingPath(path);
    try {
      await applyFileMutation.mutateAsync({ index, path });
    } finally {
      setApplyingPath(null);
    }
  };

  return (
    <div className="flex min-h-0 flex-1">
      <div
        ref={fileListRef}
        tabIndex={0}
        onKeyDown={handleArrowNav}
        style={{ width }}
        className="shrink-0 overflow-auto border-r border-border outline-none"
      >
        {files.length === 0 && (
          <div className="p-3 text-center text-sm text-muted-foreground">No files</div>
        )}
        {files.map(([path, status]) => (
          <ContextMenu key={path}>
            <ContextMenuTrigger asChild>
              <div
                className={cn(
                  "group flex h-7 items-center gap-2 px-2 text-sm hover:bg-accent",
                  selectedPath === path && "bg-accent",
                )}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-2"
                      onClick={() => setSelectedPath(path)}
                    >
                      <FileTypeIcon path={path} className="size-3.5 shrink-0" />
                      <FilePathLabel path={path} />
                      <FileStatusIcon status={status} className="size-3.5" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{`${path} (${status})`}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className={cn(
                        "shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-50",
                        selectedPath === path ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                      )}
                      disabled={applyingPath === path}
                      onClick={() => void applyFile(path)}
                    >
                      <Undo2Icon
                        className={cn("size-3.5", applyingPath === path && "animate-spin")}
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Restore this file from the stash, without popping it
                  </TooltipContent>
                </Tooltip>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <GenericFileMenuItems repoPath={repoPath} path={path} remoteInfo={null} />
            </ContextMenuContent>
          </ContextMenu>
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
  const { data: stashes } = useStashes(repoPath);
  const saveMutation = useStashSave(repoPath);
  const applyMutation = useStashApply(repoPath);
  const popMutation = useStashPop(repoPath);
  const dropMutation = useStashDrop(repoPath);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailIndex, setDetailIndex] = useState<number | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  if (!repoPath) return null;

  const doSave = async () => {
    setSaving(true);
    try {
      await saveMutation.mutateAsync({ message: "", includeUntracked: true });
    } finally {
      setSaving(false);
    }
  };

  const runRowAction = async (key: string, fn: () => Promise<void>) => {
    const startedAt = Date.now();
    setBusyKey(key);
    try {
      await fn();
    } finally {
      const elapsed = Date.now() - startedAt;
      if (elapsed < 400) await new Promise((resolve) => setTimeout(resolve, 400 - elapsed));
      setBusyKey(null);
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="secondary" size="sm">
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
              <ArchiveIcon className={cn("size-3.5", saving && "animate-spin")} />
              {saving ? "Stashing…" : "Stash All Changes"}
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
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="min-w-0 flex-1 truncate">
                        {description}
                        {branch && (
                          <span className="ml-1.5 text-xs text-muted-foreground">on {branch}</span>
                        )}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{s.message}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground disabled:opacity-50"
                        disabled={busyKey !== null}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetailIndex(s.index);
                          setDetailOpen(true);
                          setOpen(false);
                        }}
                      >
                        <ExpandIcon className="size-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>View files & diff</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        className={cn(
                          "text-muted-foreground hover:text-foreground disabled:opacity-50",
                          busyKey === `${s.index}:apply`
                            ? "opacity-100"
                            : "opacity-0 group-hover:opacity-100",
                        )}
                        disabled={busyKey !== null}
                        onClick={(e) => {
                          e.stopPropagation();
                          void runRowAction(`${s.index}:apply`, () =>
                            applyMutation.mutateAsync(s.index),
                          );
                        }}
                      >
                        <Undo2Icon
                          className={cn(
                            "size-3.5",
                            busyKey === `${s.index}:apply` && "animate-spin",
                          )}
                        />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Apply (keep stash)</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        className={cn(
                          "text-muted-foreground hover:text-foreground disabled:opacity-50",
                          busyKey === `${s.index}:pop`
                            ? "opacity-100"
                            : "opacity-0 group-hover:opacity-100",
                        )}
                        disabled={busyKey !== null}
                        onClick={(e) => {
                          e.stopPropagation();
                          void runRowAction(`${s.index}:pop`, () =>
                            popMutation.mutateAsync(s.index),
                          );
                        }}
                      >
                        <ArchiveIcon
                          className={cn("size-3.5", busyKey === `${s.index}:pop` && "animate-spin")}
                        />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Pop (apply and remove)</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        className={cn(
                          "text-muted-foreground hover:text-destructive disabled:opacity-50",
                          busyKey === `${s.index}:drop`
                            ? "opacity-100"
                            : "opacity-0 group-hover:opacity-100",
                        )}
                        disabled={busyKey !== null}
                        onClick={(e) => {
                          e.stopPropagation();
                          void runRowAction(`${s.index}:drop`, () =>
                            dropMutation.mutateAsync(s.index),
                          );
                        }}
                      >
                        <Trash2Icon
                          className={cn(
                            "size-3.5",
                            busyKey === `${s.index}:drop` && "animate-spin",
                          )}
                        />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Drop</TooltipContent>
                  </Tooltip>
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
                const message =
                  detailIndex !== null
                    ? stashes.find((s) => s.index === detailIndex)?.message
                    : null;
                if (!message) return "";
                const { branch, description } = parseStashMessage(message);
                return branch ? `${description} (stashed on ${branch})` : description;
              })()}
            </DialogTitle>
          </DialogHeader>
          {repoPath && detailIndex !== null && (
            <StashDetail repoPath={repoPath} index={detailIndex} />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
