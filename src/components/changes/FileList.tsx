import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { TriangleAlertIcon } from "lucide-react";
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
import { getFileIcon } from "@/lib/file-icons";
import { api } from "@/lib/tauri";
import { useRepoStore } from "@/store/useRepoStore";

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
          const { icon: Icon, color } = getFileIcon(file.path);
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
                  <span className="relative shrink-0">
                    {file.status === "conflicted" ? (
                      <TriangleAlertIcon className="size-3.5 text-destructive" />
                    ) : (
                      <Icon className="size-3.5" style={{ color }} />
                    )}
                    <span
                      className={cn(
                        "absolute -right-0.5 -bottom-0.5 size-1.5 rounded-full ring-1 ring-background",
                        STATUS_DOT_COLOR[file.status],
                      )}
                    />
                  </span>
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
