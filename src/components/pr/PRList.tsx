import { useMemo, useState, useEffect, useRef } from "react";
import { useArrowKeyFileNav } from "@/hooks/useArrowKeyFileNav";
import {
  GitPullRequestIcon,
  GitPullRequestDraftIcon,
  GitPullRequestClosedIcon,
  GitPullRequestArrowIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { PullRequest } from "@/lib/types";
import { prPollIntervalMs, useIsPrTabActive } from "@/hooks/queries/useCheckRuns";
import { CIBadge } from "./CIBadge";
import { Skeleton } from "@/components/ui/skeleton";

type PRStatus = "merged" | "draft" | "closed" | "open";

function prStatus(pr: PullRequest): PRStatus {
  if (pr.merged) return "merged";
  if (pr.draft) return "draft";
  if (pr.state === "closed") return "closed";
  return "open";
}

const PR_STATUS_ICON: Record<PRStatus, typeof GitPullRequestIcon> = {
  merged: GitPullRequestIcon,
  draft: GitPullRequestDraftIcon,
  closed: GitPullRequestClosedIcon,
  open: GitPullRequestArrowIcon,
};

const PR_STATUS_COLOR: Record<PRStatus, string> = {
  merged: "text-accent-purple",
  draft: "text-muted-foreground",
  closed: "text-destructive",
  open: "text-accent-green",
};

interface PRListProps {
  loading: boolean;
  repoPath: string;
  login: string;
  pulls: PullRequest[];
  selectedNumber: number | null;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onSelect: (number: number) => void;
}

export function PRList({ loading, repoPath, login, pulls, selectedNumber, hasMore, loadingMore, onLoadMore, onSelect }: PRListProps) {
  const [filter, setFilter] = useState("");
  const isPrTabActive = useIsPrTabActive();

  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = observerTarget.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          onLoadMore();
        }
      },
      { rootMargin: "100px" }
    );
    observer.observe(target);
    return () => observer.unobserve(target);
  }, [hasMore, loadingMore, onLoadMore]);

  const filtered = useMemo(() => {
    if (!filter.trim()) return pulls;
    const needle = filter.toLowerCase();
    return pulls.filter(
      (p) =>
        p.title.toLowerCase().includes(needle) ||
        p.author_login.toLowerCase().includes(needle) ||
        String(p.number).includes(needle),
    );
  }, [pulls, filter]);

  const listRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const numberKeys = useMemo(() => filtered.map((p) => String(p.number)), [filtered]);
  const handleArrowNav = useArrowKeyFileNav(
    numberKeys,
    selectedNumber !== null ? String(selectedNumber) : null,
    (key) => onSelect(Number(key)),
  );

  useEffect(() => {
    if (selectedNumber === null) return;
    rowRefs.current.get(selectedNumber)?.scrollIntoView({ block: "nearest" });
  }, [selectedNumber]);

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
        {loading && pulls.length === 0 ? (
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
          <div className="p-4 text-center text-sm text-muted-foreground">No pull requests found</div>
        ) : (
          filtered.map((pr) => {
            const status = prStatus(pr);
            const Icon = PR_STATUS_ICON[status];
            return (
              <div
                key={pr.number}
                ref={(el) => {
                  if (el) rowRefs.current.set(pr.number, el);
                  else rowRefs.current.delete(pr.number);
                }}
                className={cn(
                  "flex cursor-pointer items-start gap-2 border-b border-border/50 px-2 py-2 text-sm hover:bg-accent",
                  selectedNumber === pr.number && "bg-accent",
                )}
                onClick={() => onSelect(pr.number)}
              >
                <Icon className={cn("mt-0.5 size-3.5 shrink-0", PR_STATUS_COLOR[status])} />
                <div className="min-w-0 flex-1">
                  <div className="truncate">{pr.title}</div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Avatar src={pr.author_avatar_url} alt={pr.author_login} className="size-3.5" />
                    <span>
                      #{pr.number} by {pr.author_login}
                    </span>
                    <CIBadge
                      repoPath={repoPath}
                      login={login}
                      sha={pr.head_sha}
                      pollIntervalMs={prPollIntervalMs(pr, isPrTabActive, pr.number === selectedNumber)}
                    />
                    {pr.merged && (
                      <span className="rounded bg-accent-purple/20 px-1 text-accent-purple">merged</span>
                    )}
                  </div>
                  {pr.labels.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {pr.labels.map((label) => (
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
            );
          })
        )}
        {hasMore && pulls.length > 0 && (
          <div ref={observerTarget} className="p-4 text-center text-sm text-muted-foreground">
            {loadingMore ? "Loading more…" : "Scroll for more"}
          </div>
        )}
      </div>
    </div>
  );
}
