import { useEffect, useMemo, useState } from "react";
import { ChevronsUpDownIcon, GitBranchIcon, LockIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AddRepoMenu } from "./AddRepoMenu";
import { useRepoStore } from "@/store/useRepoStore";
import { api } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import type { RepoEntry } from "@/lib/types";

function groupRepos(repos: RepoEntry[]): Map<string, RepoEntry[]> {
  const groups = new Map<string, RepoEntry[]>();
  for (const repo of repos) {
    const list = groups.get(repo.group) ?? [];
    list.push(repo);
    groups.set(repo.group, list);
  }
  return groups;
}

export function RepositorySwitcher() {
  const repos = useRepoStore((s) => s.repos);
  const selectedRepo = useRepoStore((s) => s.selectedRepo);
  const selectRepo = useRepoStore((s) => s.selectRepo);
  const removeRepo = useRepoStore((s) => s.removeRepo);
  const setRepoPrivateLocal = useRepoStore.setState;

  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [dirty, setDirty] = useState<Record<string, boolean>>({});

  const current = repos.find((r) => r.path === selectedRepo);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void Promise.all(
      repos.map(async (r) => [r.path, await api.isDirty(r.path).catch(() => false)] as const),
    ).then((results) => {
      if (cancelled) return;
      setDirty(Object.fromEntries(results));
    });
    return () => {
      cancelled = true;
    };
  }, [open, repos]);

  const filtered = useMemo(() => {
    if (!filter.trim()) return repos;
    const needle = filter.toLowerCase();
    return repos.filter(
      (r) => r.name.toLowerCase().includes(needle) || r.group.toLowerCase().includes(needle),
    );
  }, [repos, filter]);

  const grouped = useMemo(() => groupRepos(filtered), [filtered]);

  const togglePrivate = async (repo: RepoEntry) => {
    const updated = await api.setRepoPrivate(repo.path, !repo.is_private);
    setRepoPrivateLocal({ repos: updated });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-56 justify-between">
          <span className="flex min-w-0 items-center gap-2">
            <GitBranchIcon className="size-4 shrink-0" />
            <span className="truncate">{current?.name ?? "Select a repository"}</span>
          </span>
          <ChevronsUpDownIcon className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0">
        <div className="flex items-center gap-2 border-b border-border p-2">
          <Input
            autoFocus
            placeholder="Filter repositories"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-7"
          />
          <AddRepoMenu />
        </div>
        <div className="max-h-80 overflow-auto p-1">
          {filtered.length === 0 && (
            <div className="p-3 text-center text-sm text-muted-foreground">No repositories</div>
          )}
          {[...grouped.entries()].map(([group, groupRepos]) => (
            <div key={group}>
              <div className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">
                {group}
              </div>
              {groupRepos.map((repo) => (
                <div
                  key={repo.path}
                  className={cn(
                    "group flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent cursor-pointer",
                    selectedRepo === repo.path && "bg-accent",
                  )}
                  onClick={() => {
                    void selectRepo(repo.path);
                    setOpen(false);
                  }}
                >
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      dirty[repo.path] ? "bg-primary" : "bg-transparent",
                    )}
                    title={dirty[repo.path] ? "Uncommitted changes" : undefined}
                  />
                  <span className="truncate flex-1">{repo.name}</span>
                  <button
                    title={repo.is_private ? "Marked private" : "Mark as private"}
                    onClick={(e) => {
                      e.stopPropagation();
                      void togglePrivate(repo);
                    }}
                    className={cn(
                      "opacity-0 group-hover:opacity-100",
                      repo.is_private && "opacity-100 text-foreground",
                    )}
                  >
                    <LockIcon className="size-3.5" />
                  </button>
                  <button
                    title="Remove from list"
                    onClick={(e) => {
                      e.stopPropagation();
                      void removeRepo(repo.path);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
