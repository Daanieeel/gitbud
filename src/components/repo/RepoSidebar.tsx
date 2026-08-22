import { useEffect, useMemo, useState } from "react";
import {
  CopyIcon,
  FolderInputIcon,
  FolderOpenIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  RefreshCwIcon,
  TerminalIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { AddRepoMenu } from "./AddRepoMenu";
import { BatchSyncTrigger } from "./BatchSyncPanel";
import { WorkspacePicker } from "./WorkspacePicker";
import { AccountBar } from "@/components/github/AccountBar";
import { ResizeHandle } from "@/components/layout/ResizeHandle";
import { useResizableWidth } from "@/hooks/useResizableWidth";
import { useRepoStore } from "@/store/useRepoStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { api } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";
import type { AheadBehind, RepoEntry } from "@/lib/types";

function groupKey(repo: RepoEntry): string {
  return repo.section ?? repo.group;
}

function groupRepos(repos: RepoEntry[]): Map<string, RepoEntry[]> {
  const groups = new Map<string, RepoEntry[]>();
  for (const repo of repos) {
    const key = groupKey(repo);
    const list = groups.get(key) ?? [];
    list.push(repo);
    groups.set(key, list);
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
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeId);
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  const { width, onPointerDown } = useResizableWidth("sidebar-width:repos", 256, 200, 480);
  const [filter, setFilter] = useState("");
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [aheadBehind, setAheadBehind] = useState<Record<string, AheadBehind>>({});
  const [draggedPath, setDraggedPath] = useState<string | null>(null);
  const [confirmRemovePath, setConfirmRemovePath] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(() => window.localStorage.getItem("sidebar-collapsed") === "1");

  useEffect(() => {
    window.localStorage.setItem("sidebar-collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

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
          [r.path, await api.getAheadBehind(r.path).catch(() => ({ ahead: 0, behind: 0, published: true }))] as const,
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
    const scoped = activeWorkspace
      ? repos.filter((r) => activeWorkspace.repo_paths.includes(r.path))
      : repos;
    if (!filter.trim()) return scoped;
    const needle = filter.toLowerCase();
    return scoped.filter(
      (r) =>
        r.name.toLowerCase().includes(needle) ||
        r.group.toLowerCase().includes(needle) ||
        r.section?.toLowerCase().includes(needle),
    );
  }, [repos, filter, activeWorkspace]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    if (sidebarSort === "name") {
      copy.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sidebarSort === "recent") {
      copy.sort((a, b) => (b.last_fetched ?? 0) - (a.last_fetched ?? 0));
    }
    // "manual" keeps whatever order repos.json is in — drag-to-reorder rewrites that order.
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

  const moveToSection = async (repo: RepoEntry) => {
    const input = window.prompt(
      "Move to section (leave blank to use the default grouping):",
      repo.section ?? "",
    );
    if (input === null) return;
    const updated = await api.setRepoSection(repo.path, input.trim() || null);
    setReposLocal({ repos: updated });
  };

  const reorder = async (overPath: string) => {
    if (!draggedPath || draggedPath === overPath) return;
    const next = [...repos];
    const fromIndex = next.findIndex((r) => r.path === draggedPath);
    const toIndex = next.findIndex((r) => r.path === overPath);
    if (fromIndex === -1 || toIndex === -1) return;
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    setReposLocal({ repos: next });
    await api.setRepoOrder(next.map((r) => r.path));
  };

  return (
    <div className="flex h-full shrink-0">
    <aside
      style={{ width: collapsed ? 56 : width }}
      className={cn(
        "flex h-full shrink-0 flex-col overflow-hidden rounded-xl bg-card shadow-md transition-[width] duration-150 ease-in-out",
        dragOver && "ring-2 ring-inset ring-primary",
      )}
    >
      {collapsed ? (
        <>
          <div className="flex shrink-0 flex-col items-center gap-1 border-b border-border p-1.5">
            <AddRepoMenu />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => setCollapsed(false)}>
                  <PanelLeftOpenIcon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Expand sidebar</TooltipContent>
            </Tooltip>
          </div>
          <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-1 overflow-auto p-1.5">
            {sorted.map((repo) => (
              <Tooltip key={repo.path}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => void selectRepo(repo.path)}
                    className={cn(
                      "relative flex size-9 shrink-0 items-center justify-center rounded-md text-xs font-medium hover:bg-accent",
                      selectedRepo === repo.path && "bg-accent",
                    )}
                  >
                    {repo.name.slice(0, 2).toUpperCase()}
                    {dirty[repo.path] && (
                      <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-primary" />
                    )}
                    {syncing && selectedRepo === repo.path && (
                      <RefreshCwIcon className="absolute top-0.5 right-0.5 size-2.5 animate-spin text-primary" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{repo.name}</TooltipContent>
              </Tooltip>
            ))}
          </div>
          {repos.length > 0 && (
            <div className="flex shrink-0 flex-col items-center gap-1 border-t border-border p-1.5">
              <BatchSyncTrigger repos={filtered} totalCount={repos.length} iconOnly />
            </div>
          )}
          <AccountBar collapsed />
        </>
      ) : (
        <>
      <div className="flex shrink-0 flex-col gap-2 border-b border-border p-2">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Filter repositories"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-7"
          />
          <AddRepoMenu />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => setCollapsed(true)}>
                <PanelLeftCloseIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Collapse sidebar</TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-center justify-between gap-2">
          <WorkspacePicker />
        </div>
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
                      draggable={sidebarSort === "manual"}
                      onDragStart={() => setDraggedPath(repo.path)}
                      onDragOver={(e) => {
                        if (sidebarSort === "manual") e.preventDefault();
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        void reorder(repo.path);
                        setDraggedPath(null);
                      }}
                      onDragEnd={() => setDraggedPath(null)}
                      className={cn(
                        "group flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent cursor-pointer",
                        selectedRepo === repo.path && "bg-accent",
                        sidebarSort === "manual" && "cursor-grab active:cursor-grabbing",
                        draggedPath === repo.path && "opacity-50",
                      )}
                      onClick={() => void selectRepo(repo.path)}
                    >
                      {syncing && selectedRepo === repo.path ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <RefreshCwIcon className="size-3 shrink-0 animate-spin text-primary" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>Syncing…</TooltipContent>
                        </Tooltip>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className={cn(
                                "size-1.5 shrink-0 rounded-full",
                                dirty[repo.path] ? "bg-primary" : "bg-transparent",
                              )}
                            />
                          </TooltipTrigger>
                          <TooltipContent>
                            {dirty[repo.path] ? "Uncommitted changes" : undefined}
                          </TooltipContent>
                        </Tooltip>
                      )}
                      <span className="truncate flex-1">{repo.name}</span>
                      {showAheadBehind && ab && (ab.ahead > 0 || ab.behind > 0) && (
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                          {ab.ahead > 0 && `↑${ab.ahead}`}
                          {ab.behind > 0 && `↓${ab.behind}`}
                        </span>
                      )}
                      <Popover
                        open={confirmRemovePath === repo.path}
                        onOpenChange={(open) => setConfirmRemovePath(open ? repo.path : null)}
                      >
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <PopoverTrigger asChild>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmRemovePath(repo.path);
                                }}
                                className={cn(
                                  "shrink-0 rounded-md bg-destructive/10 p-1 text-destructive opacity-0 hover:bg-destructive/20 group-hover:opacity-100",
                                  confirmRemovePath === repo.path && "opacity-100",
                                )}
                              >
                                <XIcon className="size-3.5" />
                              </button>
                            </PopoverTrigger>
                          </TooltipTrigger>
                          <TooltipContent>Remove from list</TooltipContent>
                        </Tooltip>
                        <PopoverContent
                          align="end"
                          className="w-56 space-y-2 bg-accent-blue/5 p-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <p className="text-sm">Remove "{repo.name}" from the list?</p>
                          <div className="flex justify-end gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setConfirmRemovePath(null)}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                setConfirmRemovePath(null);
                                void removeRepo(repo.path);
                              }}
                            >
                              Remove
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onSelect={() => void api.openInTerminal(repo.path)}>
                      <TerminalIcon className="size-3.5" />
                      Open in Terminal
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => void revealItemInDir(repo.path)}>
                      <FolderOpenIcon className="size-3.5" />
                      Open in Finder
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => void copyToClipboard(repo.path)}>
                      <CopyIcon className="size-3.5" />
                      Copy Path
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => void moveToSection(repo)}>
                      <FolderInputIcon className="size-3.5" />
                      Move to Section…
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem variant="destructive" onSelect={() => void removeRepo(repo.path)}>
                      <Trash2Icon className="size-3.5" />
                      Remove from Sidebar
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}
          </div>
        ))}
      </div>
      {repos.length > 0 && (
        <div className="shrink-0 border-t border-border p-2">
          <BatchSyncTrigger repos={filtered} totalCount={repos.length} />
        </div>
      )}
      <AccountBar />
        </>
      )}
    </aside>
    {!collapsed && <ResizeHandle onPointerDown={onPointerDown} />}
    </div>
  );
}
