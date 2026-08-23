import { useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  CheckIcon,
  CodeIcon,
  CopyIcon,
  ExternalLinkIcon,
  FolderOpenIcon,
  TerminalIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UserIcon,
  XIcon,
} from "lucide-react";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import type { ChangeKind, FileEntry } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";
import { githubFileUrl } from "@/lib/github-links";
import { FileTypeIcon } from "@/lib/file-icons";
import { api } from "@/lib/tauri";
import { useRepoStore } from "@/store/useRepoStore";
import { useBranches } from "@/hooks/queries/useBranches";
import { useDiscardFile } from "@/hooks/queries/useRepoStatus";
import { useSettingsStore } from "@/store/useSettingsStore";
import { CUSTOM_EDITOR_ID, findEditor } from "@/lib/editors";
import { BlameDialog } from "./BlameDialog";
import { FilePathLabel } from "./FilePathLabel";
import type { LfsFileInfo } from "@/lib/types";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

const STATUS_DOT_COLOR: Record<ChangeKind, string> = {
  added: "bg-accent-green",
  untracked: "bg-accent-green",
  modified: "bg-accent-green",
  deleted: "bg-accent-pink",
  renamed: "bg-muted-foreground",
  type_change: "bg-muted-foreground",
  conflicted: "bg-destructive",
};

interface FileListProps {
  files: FileEntry[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  onToggle: (path: string, staged: boolean) => void;
  onToggleMany: (paths: string[], staged: boolean) => void;
  onDiscardMany: (paths: string[]) => void;
}

export function FileList({ files, selectedPath, onSelect, onToggle, onToggleMany, onDiscardMany }: FileListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const repoPath = useRepoStore((s) => s.selectedRepo);
  const { data: branchData } = useBranches(repoPath);
  const branch = branchData?.branch ?? null;
  const discardFileMutation = useDiscardFile(repoPath);
  const favoriteEditorId = useSettingsStore((s) => s.settings.favorite_editor);
  const customEditorCommand = useSettingsStore((s) => s.settings.custom_editor_command);
  const favoriteEditorOption = findEditor(favoriteEditorId);
  const isCustomEditor = favoriteEditorId === CUSTOM_EDITOR_ID && !!customEditorCommand;
  const [blamePath, setBlamePath] = useState<string | null>(null);
  const [confirmDiscardPath, setConfirmDiscardPath] = useState<string | null>(null);
  const [confirmDiscardBatch, setConfirmDiscardBatch] = useState(false);
  const [lfsInfo, setLfsInfo] = useState<Record<string, LfsFileInfo>>({});

  // Multi-select: shift-click extends a range from `anchorIndex`, cmd/ctrl-click toggles one
  // file in/out. A plain click always collapses back to a single selection, matching standard
  // file-explorer behavior.
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null);

  // Drop any selected paths that no longer exist (staged/discarded out from under the list)
  // rather than silently batch-acting on stale entries next time.
  useEffect(() => {
    const paths = new Set(files.map((f) => f.path));
    setSelectedPaths((prev) => {
      const next = new Set([...prev].filter((p) => paths.has(p)));
      return next.size === prev.size ? prev : next;
    });
  }, [files]);

  useEffect(() => {
    if (!repoPath || files.length === 0) {
      setLfsInfo({});
      return;
    }
    let cancelled = false;
    void api.checkLfsFiles(repoPath, files.map((f) => f.path)).then((infos) => {
      if (cancelled) return;
      setLfsInfo(Object.fromEntries(infos.filter((i) => i.is_lfs).map((i) => [i.path, i])));
    });
    return () => {
      cancelled = true;
    };
  }, [repoPath, files]);

  const virtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 12,
  });

  useEffect(() => {
    if (!selectedPath) return;
    const index = files.findIndex((f) => f.path === selectedPath);
    if (index === -1) return;
    virtualizer.scrollToIndex(index, { align: "auto" });
  }, [selectedPath, files, virtualizer]);

  const handleRowClick = (e: React.MouseEvent, path: string, index: number) => {
    if (e.shiftKey && anchorIndex != null) {
      const [start, end] = anchorIndex < index ? [anchorIndex, index] : [index, anchorIndex];
      setSelectedPaths(new Set(files.slice(start, end + 1).map((f) => f.path)));
    } else if (e.metaKey || e.ctrlKey) {
      setSelectedPaths((prev) => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
      setAnchorIndex(index);
    } else {
      setSelectedPaths(new Set([path]));
      setAnchorIndex(index);
    }
    onSelect(path);
  };

  // Right-clicking a file outside the current selection collapses the selection to just that
  // file first, mirroring Finder/Explorer — otherwise the batch menu would apply to files the
  // user never meant to include.
  const handleContextMenu = (path: string, index: number) => {
    if (!selectedPaths.has(path)) {
      setSelectedPaths(new Set([path]));
      setAnchorIndex(index);
    }
  };

  const isBatch = selectedPaths.size > 1;
  const selectedList = [...selectedPaths];

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((row) => {
          const file = files[row.index];
          const rowSelected = selectedPaths.has(file.path);
          const showBatchMenu = isBatch && rowSelected;
          return (
            <ContextMenu key={file.path} onOpenChange={(open) => open && handleContextMenu(file.path, row.index)}>
            <Popover
              open={confirmDiscardPath === file.path}
              onOpenChange={(o) => !o && setConfirmDiscardPath(null)}
            >
              <PopoverAnchor asChild>
              <ContextMenuTrigger asChild>
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: row.size,
                    transform: `translateY(${row.start}px)`,
                  }}
                  className={cn(
                    "flex items-center gap-2 px-2 text-sm cursor-pointer select-none hover:bg-accent",
                    (selectedPath === file.path || rowSelected) && "bg-accent",
                    file.status === "conflicted" && "text-destructive",
                  )}
                  onClick={(e) => handleRowClick(e, file.path, row.index)}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Checkbox
                        checked={file.partially_staged ? "indeterminate" : file.staged}
                        onClick={(e) => e.stopPropagation()}
                        onCheckedChange={(checked) => onToggle(file.path, checked === true)}
                      />
                    </TooltipTrigger>
                    <TooltipContent>
                      {file.partially_staged
                        ? "Partially staged, click to finish staging the rest"
                        : file.staged
                          ? "Unstage"
                          : "Stage"}
                    </TooltipContent>
                  </Tooltip>
                  <span className="relative shrink-0">
                    {file.status === "conflicted" ? (
                      <TriangleAlertIcon className="size-3.5 text-destructive" />
                    ) : (
                      <FileTypeIcon path={file.path} className="size-3.5" />
                    )}
                    <span
                      className={cn(
                        "absolute -right-0.5 -bottom-0.5 size-1.5 rounded-full ring-1 ring-background",
                        STATUS_DOT_COLOR[file.status],
                      )}
                    />
                  </span>
                  <FilePathLabel path={file.path} />
                  {lfsInfo[file.path] && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="shrink-0 rounded-sm bg-muted px-1 text-[10px] font-medium text-muted-foreground">
                          LFS{lfsInfo[file.path].size != null && ` · ${formatBytes(lfsInfo[file.path].size!)}`}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Tracked by Git LFS</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </ContextMenuTrigger>
              </PopoverAnchor>
              <ContextMenuContent>
                {showBatchMenu ? (
                  <>
                    <ContextMenuItem onSelect={() => onToggleMany(selectedList, true)}>
                      <CheckIcon className="size-3.5" />
                      Stage {selectedList.length} Files
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => onToggleMany(selectedList, false)}>
                      <XIcon className="size-3.5" />
                      Unstage {selectedList.length} Files
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => void copyToClipboard(selectedList.join("\n"))}>
                      <CopyIcon className="size-3.5" />
                      Copy Paths
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem variant="destructive" onSelect={() => setConfirmDiscardBatch(true)}>
                      <Trash2Icon className="size-3.5" />
                      Discard {selectedList.length} Files
                    </ContextMenuItem>
                  </>
                ) : (
                  <>
                    <ContextMenuItem onSelect={() => void copyToClipboard(file.path)}>
                      <CopyIcon className="size-3.5" />
                      Copy Path
                    </ContextMenuItem>
                    <ContextMenuItem
                      onSelect={() => {
                        if (!repoPath) return;
                        void revealItemInDir(`${repoPath}/${file.path}`);
                      }}
                    >
                      <FolderOpenIcon className="size-3.5" />
                      Reveal in Finder
                    </ContextMenuItem>
                    <ContextMenuItem
                      onSelect={() => {
                        if (!repoPath) return;
                        void api.openInTerminal(repoPath);
                      }}
                    >
                      <TerminalIcon className="size-3.5" />
                      Open in Terminal
                    </ContextMenuItem>
                    {(favoriteEditorOption || isCustomEditor) && (
                      <ContextMenuItem
                        onSelect={() => {
                          if (!repoPath || !favoriteEditorId) return;
                          void api
                            .openInEditor(`${repoPath}/${file.path}`, favoriteEditorId, customEditorCommand)
                            .catch((err) => toast.error(String(err)));
                        }}
                      >
                        {favoriteEditorOption ? (
                          <img src={favoriteEditorOption.icon} alt="" className="size-3.5" />
                        ) : (
                          <CodeIcon className="size-3.5" />
                        )}
                        Open in {favoriteEditorOption?.name ?? "Editor"}
                      </ContextMenuItem>
                    )}
                    {branch && (
                      <ContextMenuItem
                        onSelect={() => {
                          if (!repoPath) return;
                          void githubFileUrl(repoPath, branch, file.path).then((url) => {
                            if (url) void openUrl(url);
                          });
                        }}
                      >
                        <ExternalLinkIcon className="size-3.5" />
                        View File on GitHub
                      </ContextMenuItem>
                    )}
                    <ContextMenuItem onSelect={() => setBlamePath(file.path)}>
                      <UserIcon className="size-3.5" />
                      Blame File
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                      variant="destructive"
                      onSelect={() => setConfirmDiscardPath(file.path)}
                    >
                      <Trash2Icon className="size-3.5" />
                      Discard Changes
                    </ContextMenuItem>
                  </>
                )}
              </ContextMenuContent>
              <PopoverContent align="start" className="w-56 space-y-2 p-3">
                <p className="text-sm">Permanently discard changes to "{file.path}"?</p>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDiscardPath(null)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      setConfirmDiscardPath(null);
                      discardFileMutation.mutate(file.path);
                    }}
                  >
                    Discard
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            </ContextMenu>
          );
        })}
      </div>
      {repoPath && (
        <BlameDialog
          repoPath={repoPath}
          path={blamePath}
          onOpenChange={(open) => !open && setBlamePath(null)}
        />
      )}
      <Dialog open={confirmDiscardBatch} onOpenChange={setConfirmDiscardBatch}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Discard {selectedList.length} files?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This permanently discards changes to the selected files. This can't be undone.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDiscardBatch(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmDiscardBatch(false);
                onDiscardMany(selectedList);
              }}
            >
              Discard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
