import { useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  CopyIcon,
  ExternalLinkIcon,
  FolderOpenIcon,
  TerminalIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UserIcon,
} from "lucide-react";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import type { ChangeKind, FileEntry } from "@/lib/types";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";
import { githubFileUrl } from "@/lib/github-links";
import { FileTypeIcon } from "@/lib/file-icons";
import { api } from "@/lib/tauri";
import { useRepoStore } from "@/store/useRepoStore";
import { BlameDialog } from "./BlameDialog";
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
}

export function FileList({ files, selectedPath, onSelect, onToggle }: FileListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const repoPath = useRepoStore((s) => s.selectedRepo);
  const branch = useRepoStore((s) => s.branch);
  const discardFile = useRepoStore((s) => s.discardFile);
  const [blamePath, setBlamePath] = useState<string | null>(null);
  const [lfsInfo, setLfsInfo] = useState<Record<string, LfsFileInfo>>({});

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

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((row) => {
          const file = files[row.index];
          return (
            <ContextMenu key={file.path}>
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
                    "flex items-center gap-2 px-2 text-sm cursor-pointer hover:bg-accent",
                    selectedPath === file.path && "bg-accent",
                    file.status === "conflicted" && "text-destructive",
                  )}
                  onClick={() => onSelect(file.path)}
                >
                  <Checkbox
                    checked={file.staged}
                    title={file.staged ? "Unstage" : "Stage"}
                    onClick={(e) => e.stopPropagation()}
                    onCheckedChange={(checked) => onToggle(file.path, checked === true)}
                  />
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
                  <span className="truncate">{file.path}</span>
                  {lfsInfo[file.path] && (
                    <span
                      className="shrink-0 rounded-sm bg-muted px-1 text-[10px] font-medium text-muted-foreground"
                      title="Tracked by Git LFS"
                    >
                      LFS{lfsInfo[file.path].size != null && ` · ${formatBytes(lfsInfo[file.path].size!)}`}
                    </span>
                  )}
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent>
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
                  onSelect={() => void discardFile(file.path)}
                >
                  <Trash2Icon className="size-3.5" />
                  Discard Changes
                </ContextMenuItem>
              </ContextMenuContent>
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
    </div>
  );
}
