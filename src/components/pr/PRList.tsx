import { useMemo, useState } from "react";
import { BellIcon, BellRingIcon, GitPullRequestIcon, GitPullRequestDraftIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { PullRequest } from "@/lib/types";
import { usePRStore } from "@/store/usePRStore";
import { CIBadge } from "./CIBadge";

interface PRListProps {
  repoPath: string;
  login: string;
  pulls: PullRequest[];
  selectedNumber: number | null;
  onSelect: (number: number) => void;
}

export function PRList({ repoPath, login, pulls, selectedNumber, onSelect }: PRListProps) {
  const [filter, setFilter] = useState("");
  const watched = usePRStore((s) => s.watched);
  const toggleWatch = usePRStore((s) => s.toggleWatch);

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
      <div className="min-h-0 flex-1 overflow-auto">
        {filtered.length === 0 && (
          <div className="p-4 text-center text-sm text-muted-foreground">No open pull requests</div>
        )}
        {filtered.map((pr) => {
          const Icon = pr.draft ? GitPullRequestDraftIcon : GitPullRequestIcon;
          return (
            <div
              key={pr.number}
              className={cn(
                "flex cursor-pointer items-start gap-2 border-b border-border/50 px-2 py-2 text-sm hover:bg-accent",
                selectedNumber === pr.number && "bg-accent",
              )}
              onClick={() => onSelect(pr.number)}
            >
              <Icon
                className={cn(
                  "mt-0.5 size-3.5 shrink-0",
                  pr.draft ? "text-muted-foreground" : "text-accent-green",
                )}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate">{pr.title}</div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span>
                    #{pr.number} by {pr.author_login}
                  </span>
                  <CIBadge repoPath={repoPath} login={login} sha={pr.head_sha} />
                  <button
                    title={
                      watched.includes(pr.number)
                        ? "Stop notifying me when CI status changes"
                        : "Notify me when CI status changes"
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleWatch(pr.number);
                    }}
                    className={cn(
                      "text-muted-foreground hover:text-foreground",
                      watched.includes(pr.number) && "text-accent-yellow",
                    )}
                  >
                    {watched.includes(pr.number) ? (
                      <BellRingIcon className="size-3" />
                    ) : (
                      <BellIcon className="size-3" />
                    )}
                  </button>
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
        })}
      </div>
    </div>
  );
}
