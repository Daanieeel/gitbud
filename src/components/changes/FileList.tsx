import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { FileIcon, FilePlus, FileMinus, FileEdit, FileSymlink } from "lucide-react";
import type { ChangeKind, FileEntry } from "@/lib/types";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

const STATUS_ICON: Record<ChangeKind, typeof FileIcon> = {
  added: FilePlus,
  untracked: FilePlus,
  modified: FileEdit,
  deleted: FileMinus,
  renamed: FileSymlink,
  type_change: FileEdit,
  conflicted: FileEdit,
};

const STATUS_COLOR: Record<ChangeKind, string> = {
  added: "text-[var(--diff-add-fg)]",
  untracked: "text-[var(--diff-add-fg)]",
  modified: "text-amber-500",
  deleted: "text-[var(--diff-del-fg)]",
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
            <div
              key={file.path}
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
          );
        })}
      </div>
    </div>
  );
}
