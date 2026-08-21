import { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { formatDistanceToNow } from "date-fns";
import type { CommitEntry } from "@/lib/types";
import { cn } from "@/lib/utils";

interface CommitListProps {
  commits: CommitEntry[];
  selectedOid: string | null;
  onSelect: (oid: string) => void;
  onNeedMore: () => void;
}

export function CommitList({ commits, selectedOid, onSelect, onNeedMore }: CommitListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: commits.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 52,
    overscan: 12,
  });

  const items = virtualizer.getVirtualItems();
  const lastIndex = items.length > 0 ? items[items.length - 1].index : -1;

  useEffect(() => {
    if (lastIndex >= commits.length - 5) onNeedMore();
  }, [lastIndex, commits.length, onNeedMore]);

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {items.map((row) => {
          const commit = commits[row.index];
          const initial = (commit.author_name || commit.author_email || "?")
            .trim()
            .charAt(0)
            .toUpperCase();
          return (
            <div
              key={commit.oid}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: row.size,
                transform: `translateY(${row.start}px)`,
              }}
              className={cn(
                "flex cursor-pointer items-center gap-2 border-b border-border/50 px-2 hover:bg-accent",
                selectedOid === commit.oid && "bg-accent",
              )}
              onClick={() => onSelect(commit.oid)}
            >
              <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary text-[10px] font-medium">
                {initial}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{commit.summary}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(commit.timestamp * 1000), { addSuffix: true })}
                </div>
              </div>
              <div className="shrink-0 font-mono text-xs text-muted-foreground">
                {commit.short_oid}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
