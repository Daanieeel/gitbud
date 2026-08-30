import { useMemo, useState, useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { CircleCheckIcon, CircleDotIcon, CopyIcon, ExternalLinkIcon } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Input } from "@gitbud/ui/input";
import { Avatar } from "@gitbud/ui/avatar";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@gitbud/ui/context-menu";
import { Skeleton } from "@gitbud/ui/skeleton";
import { cn } from "@gitbud/ui/utils";
import { useArrowKeyFileNav } from "@/hooks/useArrowKeyFileNav";
import { copyToClipboard } from "@/lib/clipboard";
import type { Issue } from "@/lib/types";

// Just a starting guess (see `measureElement` below) — most rows are this tall, but one with
// labels wraps a second line of pills underneath and grows. Mirrors PRList.tsx.
const ROW_HEIGHT_ESTIMATE = 52;

interface IssueListProps {
  loading: boolean;
  issues: Issue[];
  selectedNumber: number | null;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onSelect: (number: number) => void;
}

export function IssueList({
  loading,
  issues,
  selectedNumber,
  hasMore,
  loadingMore,
  onLoadMore,
  onSelect,
}: IssueListProps) {
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    if (!filter.trim()) return issues;
    const needle = filter.toLowerCase();
    return issues.filter(
      (i) =>
        i.title.toLowerCase().includes(needle) ||
        i.author_login.toLowerCase().includes(needle) ||
        String(i.number).includes(needle),
    );
  }, [issues, filter]);

  const listRef = useRef<HTMLDivElement>(null);
  const numberKeys = useMemo(() => filtered.map((i) => String(i.number)), [filtered]);
  const handleArrowNav = useArrowKeyFileNav(
    numberKeys,
    selectedNumber !== null ? String(selectedNumber) : null,
    (key) => onSelect(Number(key)),
  );

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => ROW_HEIGHT_ESTIMATE,
    overscan: 12,
  });

  const items = virtualizer.getVirtualItems();
  const lastIndex = items.length > 0 ? items[items.length - 1].index : -1;

  useEffect(() => {
    if (hasMore && !loadingMore && lastIndex >= filtered.length - 5) onLoadMore();
  }, [lastIndex, filtered.length, hasMore, loadingMore, onLoadMore]);

  useEffect(() => {
    if (selectedNumber === null) return;
    const index = filtered.findIndex((i) => i.number === selectedNumber);
    if (index === -1) return;
    virtualizer.scrollToIndex(index, { align: "auto" });
  }, [selectedNumber, filtered, virtualizer]);

  useEffect(() => {
    listRef.current?.focus();
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border p-2">
        <Input
          placeholder="Filter by title, author, or #"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-7"
        />
      </div>
      <div
        ref={listRef}
        tabIndex={0}
        onKeyDown={handleArrowNav}
        className="min-h-0 flex-1 overflow-auto outline-none"
      >
        {loading && issues.length === 0 ? (
          <div className="flex flex-col">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex items-start gap-2 border-b border-border/50 px-2 py-2">
                <Skeleton className="mt-0.5 size-3.5 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2 py-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">No issues found</div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {items.map((vi) => {
              const issue = filtered[vi.index];
              const isOpen = issue.state === "open";
              const Icon = isOpen ? CircleDotIcon : CircleCheckIcon;
              return (
                <div
                  key={vi.key}
                  ref={virtualizer.measureElement}
                  data-index={vi.index}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${vi.start}px)`,
                  }}
                >
                  <ContextMenu>
                    <ContextMenuTrigger asChild>
                      <div
                        className={cn(
                          "flex cursor-pointer items-start gap-2 border-b border-border/50 px-2 py-2 text-sm hover:bg-accent",
                          selectedNumber === issue.number && "bg-accent",
                        )}
                        onClick={() => onSelect(issue.number)}
                      >
                        <Icon
                          className={cn(
                            "mt-0.5 size-3.5 shrink-0",
                            isOpen ? "text-accent-green" : "text-accent-purple",
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate">{issue.title}</div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Avatar
                              src={issue.author_avatar_url}
                              alt={issue.author_login}
                              className="size-3.5"
                            />
                            <span>
                              #{issue.number} by {issue.author_login}
                            </span>
                          </div>
                          {issue.labels.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {issue.labels.map((label) => (
                                <span
                                  key={label}
                                  className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground"
                                >
                                  {label}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                      <ContextMenuItem onSelect={() => void openUrl(issue.html_url)}>
                        <ExternalLinkIcon className="size-3.5" />
                        Open issue on GitHub
                      </ContextMenuItem>
                      <ContextMenuItem onSelect={() => void copyToClipboard(issue.html_url)}>
                        <CopyIcon className="size-3.5" />
                        Copy issue URL
                      </ContextMenuItem>
                      <ContextMenuItem onSelect={() => void copyToClipboard(String(issue.number))}>
                        <CopyIcon className="size-3.5" />
                        Copy issue number
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                </div>
              );
            })}
          </div>
        )}
        {loadingMore && (
          <div className="p-4 text-center text-sm text-muted-foreground">Loading more…</div>
        )}
      </div>
    </div>
  );
}
