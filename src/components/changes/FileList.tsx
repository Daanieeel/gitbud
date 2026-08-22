import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FileIcon, FilePlus, FileMinus, FileEdit, FileSymlink, TriangleAlertIcon } from "lucide-react";
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
import { api } from "@/lib/tauri";
import { useRepoStore } from "@/store/useRepoStore";

const STATUS_ICON: Record<ChangeKind, typeof FileIcon> = {
  added: FilePlus,
  untracked: FilePlus,
  modified: FileEdit,
  deleted: FileMinus,
  renamed: FileSymlink,
  type_change: FileEdit,
  conflicted: TriangleAlertIcon,
};

const STATUS_COLOR: Record<ChangeKind, string> = {
  added: "text-accent-green",
  untracked: "text-accent-green",
  modified: "text-accent-green",
  deleted: "text-accent-pink",
  renamed: "text-muted-foreground",
  type_change: "text-muted-foreground",
  conflicted: "text-destructive",
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
          const Icon = STATUS_ICON[file.status];
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
                    onClick={(e) => e.stopPropagation()}
                    onCheckedChange={(checked) => onToggle(file.path, checked === true)}
                  />
                  <Icon className={cn("size-3.5 shrink-0", STATUS_COLOR[file.status])} />
                  <span className="truncate">{file.path}</span>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onSelect={() => void copyToClipboard(file.path)}>
                  Copy Path
                </ContextMenuItem>
                <ContextMenuItem
                  onSelect={() => {
                    if (!repoPath) return;
                    void revealItemInDir(`${repoPath}/${file.path}`);
                  }}
                >
                  Reveal in Finder
                </ContextMenuItem>
                <ContextMenuItem
                  onSelect={() => {
                    if (!repoPath) return;
                    void api.openInTerminal(repoPath);
                  }}
                >
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
                    View File on GitHub
                  </ContextMenuItem>
                )}
                <ContextMenuSeparator />
                <ContextMenuItem
                  variant="destructive"
                  onSelect={() => void discardFile(file.path)}
                >
                  Discard Changes
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>
    </div>
  );
}
