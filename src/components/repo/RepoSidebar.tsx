import { useEffect, useMemo, useState } from "react";
import { LockIcon, RefreshCwIcon, XIcon } from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { Input } from "@/components/ui/input";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { AddRepoMenu } from "./AddRepoMenu";
import { AccountBar } from "@/components/github/AccountBar";
import { useRepoStore } from "@/store/useRepoStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { api } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";
import type { AheadBehind, RepoEntry } from "@/lib/types";

function groupRepos(repos: RepoEntry[]): Map<string, RepoEntry[]> {
  const groups = new Map<string, RepoEntry[]>();
  for (const repo of repos) {
    const list = groups.get(repo.group) ?? [];
    list.push(repo);
    groups.set(repo.group, list);
  }
  return groups;
}

export function RepoSidebar() {
  const repos = useRepoStore((s) => s.repos);
  const selectedRepo = useRepoStore((s) => s.selectedRepo);
  const selectRepo = useRepoStore((s) => s.selectRepo);
  const removeRepo = useRepoStore((s) => s.removeRepo);
  const addExistingRepo = useRepoStore((s) => s.addExistingRepo);
  const setReposLocal = useRepoStore.setState;
  const syncing = useRepoStore((s) => s.syncing);
  const [dragOver, setDragOver] = useState(false);
  const sidebarSort = useSettingsStore((s) => s.settings.sidebar_sort);
  const showAheadBehind = useSettingsStore((s) => s.settings.show_ahead_behind);

  const [filter, setFilter] = useState("");
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [aheadBehind, setAheadBehind] = useState<Record<string, AheadBehind>>({});

  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      repos.map(async (r) => [r.path, await api.isDirty(r.path).catch(() => false)] as const),
    ).then((results) => {
      if (cancelled) return;
      setDirty(Object.fromEntries(results));
    });
    void Promise.all(
      repos.map(
        async (r) =>
          [r.path, await api.getAheadBehind(r.path).catch(() => ({ ahead: 0, behind: 0 }))] as const,
      ),
    ).then((results) => {
      if (cancelled) return;
      setAheadBehind(Object.fromEntries(results));
    });
    return () => {
      cancelled = true;
    };
  }, [repos]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "drop") {
          setDragOver(false);
          for (const path of event.payload.paths) {
            void addExistingRepo(path).catch(() => {});
          }
        } else if (event.payload.type === "enter" || event.payload.type === "over") {
          setDragOver(true);
        } else {
          setDragOver(false);
        }
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => unlisten?.();
  }, [addExistingRepo]);

  const filtered = useMemo(() => {
    if (!filter.trim()) return repos;
    const needle = filter.toLowerCase();
    return repos.filter(
      (r) => r.name.toLowerCase().includes(needle) || r.group.toLowerCase().includes(needle),
    );
  }, [repos, filter]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    if (sidebarSort === "name") {
      copy.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sidebarSort === "recent") {
      copy.sort((a, b) => (b.last_fetched ?? 0) - (a.last_fetched ?? 0));
    }
    return copy;
  }, [filtered, sidebarSort]);

  const grouped = useMemo(() => {
    if (sidebarSort !== "group") {
      return new Map([["", sorted]]);
    }
    const groups = groupRepos(sorted);
    for (const list of groups.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return new Map([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)));
  }, [sorted, sidebarSort]);

  const togglePrivate = async (repo: RepoEntry) => {
    const updated = await api.setRepoPrivate(repo.path, !repo.is_private);
    setReposLocal({ repos: updated });
  };

  return (
    <aside
      className={cn(
        "flex h-full w-64 shrink-0 flex-col border-r border-border",
        dragOver && "ring-2 ring-inset ring-primary",
      )}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border p-2">
        <Input
          placeholder="Filter repositories"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-7"
        />
        <AddRepoMenu />
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-1">
        {filtered.length === 0 && (
          <div className="p-3 text-center text-sm text-muted-foreground">
            {repos.length === 0 ? 'Use "+" to add a repository' : "No matches"}
          </div>
        )}
        {[...grouped.entries()].map(([group, groupRepos]) => (
          <div key={group}>
            {group && (
              <div className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">
                {group}
              </div>
            )}
            {groupRepos.map((repo) => {
              const ab = aheadBehind[repo.path];
              return (
                <ContextMenu key={repo.path}>
                  <ContextMenuTrigger asChild>
                    <div
                      className={cn(
                        "group flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent cursor-pointer",
                        selectedRepo === repo.path && "bg-accent",
                      )}
                      onClick={() => void selectRepo(repo.path)}
                    >
                      {syncing && selectedRepo === repo.path ? (
                        <span title="Syncing…">
                          <RefreshCwIcon className="size-3 shrink-0 animate-spin text-primary" />
                        </span>
                      ) : (
                        <span
                          className={cn(
                            "size-1.5 shrink-0 rounded-full",
                            dirty[repo.path] ? "bg-primary" : "bg-transparent",
                          )}
                          title={dirty[repo.path] ? "Uncommitted changes" : undefined}
                        />
                      )}
                      <span className="truncate flex-1">{repo.name}</span>
                      {showAheadBehind && ab && (ab.ahead > 0 || ab.behind > 0) && (
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                          {ab.ahead > 0 && `↑${ab.ahead}`}
                          {ab.behind > 0 && `↓${ab.behind}`}
                        </span>
                      )}
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
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onSelect={() => void api.openInTerminal(repo.path)}>
                      Open in Terminal
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => void revealItemInDir(repo.path)}>
                      Open in Finder
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => void copyToClipboard(repo.path)}>
                      Copy Path
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem variant="destructive" onSelect={() => void removeRepo(repo.path)}>
                      Remove from Sidebar
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}
          </div>
        ))}
      </div>
      <AccountBar />
    </aside>
  );
}
