import { useState } from "react";
import { ChevronDownIcon, ChevronRightIcon, LockKeyholeIcon } from "lucide-react";
import { Input } from "@gitbud/ui/input";
import { Avatar } from "@gitbud/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gitbud/ui/tooltip";
import { cn } from "@gitbud/ui/utils";

/** Provider-agnostic shape for one clonable repo — GitHub today, GitLab/Bitbucket once those
 * accounts are wired up, each just needs its own mapper into this shape to reuse this list. */
export interface RepoListEntry {
  cloneUrl: string;
  ownerLogin: string;
  repoName: string;
  avatarUrl: string;
  private: boolean;
  fork: boolean;
}

interface RepoPickerListProps {
  entries: RepoListEntry[] | null;
  filter: string;
  onFilterChange: (value: string) => void;
  selectedUrl: string;
  onSelect: (cloneUrl: string) => void;
  searchPlaceholder?: string;
}

function groupByOwner(entries: RepoListEntry[]): Map<string, RepoListEntry[]> {
  const groups = new Map<string, RepoListEntry[]>();
  for (const entry of entries) {
    const list = groups.get(entry.ownerLogin) ?? [];
    list.push(entry);
    groups.set(entry.ownerLogin, list);
  }
  return new Map([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

/** Search box + a repo list grouped by owner org/user, same grouping treatment as the repo
 * sidebar. Filtering matches against the full "owner/repo" so searching an org name still works
 * even though the owner is stripped out of each row's own label. */
export function RepoPickerList({
  entries,
  filter,
  onFilterChange,
  selectedUrl,
  onSelect,
  searchPlaceholder = "Search repositories",
}: RepoPickerListProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleCollapsed = (owner: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(owner)) next.delete(owner);
      else next.add(owner);
      return next;
    });
  };

  const filtered = (entries ?? []).filter((e) =>
    `${e.ownerLogin}/${e.repoName}`.toLowerCase().includes(filter.trim().toLowerCase()),
  );
  const grouped = groupByOwner(filtered);

  return (
    <div className="flex flex-col gap-1">
      <Input
        placeholder={searchPlaceholder}
        value={filter}
        onChange={(e) => onFilterChange(e.target.value)}
        className="h-7"
      />
      <div className="max-h-40 overflow-auto rounded-md border border-border">
        {entries === null && (
          <div className="p-2 text-center text-xs text-muted-foreground">Loading…</div>
        )}
        {entries !== null && filtered.length === 0 && (
          <div className="p-2 text-center text-xs text-muted-foreground">No matches</div>
        )}
        {[...grouped.entries()].map(([owner, repos]) => {
          const isCollapsed = collapsed.has(owner);
          const visibleRepos = repos.filter(
            (repo) => !isCollapsed || repo.cloneUrl === selectedUrl,
          );
          return (
            <div key={owner}>
              <button
                type="button"
                className="flex w-full items-center gap-1 px-2 pt-1.5 pb-0.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                onClick={() => toggleCollapsed(owner)}
              >
                {isCollapsed ? (
                  <ChevronRightIcon className="size-3 shrink-0" />
                ) : (
                  <ChevronDownIcon className="size-3 shrink-0" />
                )}
                <span className="truncate">{owner}</span>
              </button>
              {visibleRepos.map((repo) => (
                <div
                  key={repo.cloneUrl}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 px-2 py-1.5 text-sm hover:bg-accent",
                    selectedUrl === repo.cloneUrl && "bg-accent",
                  )}
                  onClick={() => onSelect(repo.cloneUrl)}
                >
                  <Avatar src={repo.avatarUrl} alt="" className="size-4" />
                  <span className="truncate">{repo.repoName}</span>
                  {repo.fork && (
                    <span className="shrink-0 text-xs text-muted-foreground">fork</span>
                  )}
                  <span className="flex-1" />
                  {repo.private && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <LockKeyholeIcon className="size-3 shrink-0 text-muted-foreground" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Private repository</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
