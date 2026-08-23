import { useEffect, useMemo, useState } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronsDownUpIcon,
  ChevronsUpDownIcon,
  CopyIcon,
  FolderOpenIcon,
  MinusIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PencilIcon,
  PinIcon,
  RefreshCwIcon,
  TerminalIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { listen } from "@tauri-apps/api/event";
import { Input } from "@/components/ui/input";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { AddRepoMenu } from "./AddRepoMenu";
import { BatchSyncTrigger } from "./BatchSyncPanel";
import { PinToSectionDialog } from "./PinToSectionDialog";
import { WorkspacePicker } from "./WorkspacePicker";
import { AccountBar } from "@/components/github/AccountBar";
import { ResizeHandle } from "@/components/layout/ResizeHandle";
import { useResizableWidth } from "@/hooks/useResizableWidth";
import { useRepoStore } from "@/store/useRepoStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useWorkspaces } from "@/hooks/queries/useWorkspaces";
import { useWorkspaceFilterStore } from "@/store/useWorkspaceFilterStore";
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

/** Repos pinned to a custom section, grouped and sorted by that section name. Pinning is
 * additive — a repo keeps showing up under its own organization's group too, so this is
 * layered on top of `groupRepos`, not a replacement for it. */
function pinnedGroups(repos: RepoEntry[]): Map<string, RepoEntry[]> {
  const groups = new Map<string, RepoEntry[]>();
  for (const repo of repos) {
    for (const section of repo.sections) {
      const list = groups.get(section) ?? [];
      list.push(repo);
      groups.set(section, list);
    }
  }
  for (const list of groups.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  return new Map([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function loadCollapsedSections(): Set<string> {
  try {
    const raw = window.localStorage.getItem("sidebar-collapsed-sections");
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

interface RepoRowProps {
  repo: RepoEntry;
  selected: boolean;
  syncingHere: boolean;
  dirty: boolean;
  ab: AheadBehind | undefined;
  showAheadBehind: boolean;
  draggable: boolean;
  dragged: boolean;
  confirmRemove: boolean;
  onSelect: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onConfirmRemoveChange: (open: boolean) => void;
  onRemove: () => void;
  onPinToSection: () => void;
  /** Name of the pinned section this row is being rendered under, if any — enables the extra
   * unpin-from-this-section action alongside the always-available full removal. */
  sectionContext?: string;
  onRemoveFromSection?: () => void;
}

function RepoRow({
  repo,
  selected,
  syncingHere,
  dirty,
  ab,
  showAheadBehind,
  draggable,
  dragged,
  confirmRemove,
  onSelect,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  onConfirmRemoveChange,
  onRemove,
  onPinToSection,
  sectionContext,
  onRemoveFromSection,
}: RepoRowProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          draggable={draggable}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onDragEnd={onDragEnd}
          className={cn(
            "group flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent cursor-pointer",
            selected && "bg-accent",
            draggable && "cursor-grab active:cursor-grabbing",
            dragged && "opacity-50",
          )}
          onClick={onSelect}
        >
          {syncingHere ? (
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
                  className={cn("size-1.5 shrink-0 rounded-full", dirty ? "bg-primary" : "bg-transparent")}
                />
              </TooltipTrigger>
              <TooltipContent>{dirty ? "Uncommitted changes" : undefined}</TooltipContent>
            </Tooltip>
          )}
          <span className="truncate flex-1">{repo.name}</span>
          <div className="flex shrink-0 items-center">
            {showAheadBehind && ab && (ab.ahead > 0 || ab.behind > 0) && (
              <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                {ab.ahead > 0 && `↑${ab.ahead}`}
                {ab.behind > 0 && `↓${ab.behind}`}
              </span>
            )}
            {sectionContext && onRemoveFromSection && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemoveFromSection();
                    }}
                    className="w-0 shrink-0 overflow-hidden rounded-md bg-muted p-1 text-muted-foreground opacity-0 transition-all hover:bg-accent hover:text-foreground group-hover:w-5 group-hover:ml-1 group-hover:opacity-100"
                  >
                    <MinusIcon className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{`Remove from "${sectionContext}"`}</TooltipContent>
              </Tooltip>
            )}
            <Popover open={confirmRemove} onOpenChange={onConfirmRemoveChange}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onConfirmRemoveChange(true);
                      }}
                      className={cn(
                        "aspect-square w-0 shrink-0 overflow-hidden rounded-md bg-destructive/10 p-1 text-destructive opacity-0 transition-all hover:bg-destructive/20 group-hover:w-5 group-hover:ml-1 group-hover:opacity-100 flex items-center justify-center",
                        confirmRemove && "w-5 ml-1 opacity-100",
                      )}
                    >
                      <XIcon className="size-3.5" />
                    </button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent>Remove from GitBud</TooltipContent>
              </Tooltip>
              <PopoverContent
                align="end"
                className="w-56 space-y-2 bg-accent-blue/5 p-3"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-sm">Remove "{repo.name}" from the list?</p>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => onConfirmRemoveChange(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      onConfirmRemoveChange(false);
                      onRemove();
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
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
        <ContextMenuItem onSelect={onPinToSection}>
          <PinIcon className="size-3.5" />
          Pin to Section…
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={onRemove}>
          <Trash2Icon className="size-3.5" />
          Remove from Sidebar
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
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
  const { data: workspaces } = useWorkspaces();
  const activeWorkspaceId = useWorkspaceFilterStore((s) => s.activeId);
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);

  const { width, onPointerDown } = useResizableWidth("sidebar-width:repos", 256, 200, 480);
  const [filter, setFilter] = useState("");
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [aheadBehind, setAheadBehind] = useState<Record<string, AheadBehind>>({});
  const [draggedPath, setDraggedPath] = useState<string | null>(null);
  const [confirmRemovePath, setConfirmRemovePath] = useState<string | null>(null);
  const [pinSectionRepo, setPinSectionRepo] = useState<RepoEntry | null>(null);
  const [collapsed, setCollapsed] = useState(() => window.localStorage.getItem("sidebar-collapsed") === "1");
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => loadCollapsedSections());
  const [renamingSection, setRenamingSection] = useState<string | null>(null);
  const [renameSectionValue, setRenameSectionValue] = useState("");
  const [confirmRemoveSection, setConfirmRemoveSection] = useState<string | null>(null);

  useEffect(() => {
    window.localStorage.setItem("sidebar-collapsed", collapsed ? "1" : "0");
  }, [collapsed]);

  useEffect(() => {
    window.localStorage.setItem("sidebar-collapsed-sections", JSON.stringify([...collapsedSections]));
  }, [collapsedSections]);

  const toggleSectionCollapsed = (section: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  const startRenameSection = (section: string) => {
    setRenamingSection(section);
    setRenameSectionValue(section);
  };

  const commitRenameSection = async () => {
    if (!renamingSection) return;
    const oldName = renamingSection;
    const newName = renameSectionValue.trim();
    setRenamingSection(null);
    if (!newName || newName === oldName) return;
    const updated = await api.renameSection(oldName, newName);
    setReposLocal({ repos: updated });
    setCollapsedSections((prev) => {
      if (!prev.has(`pin:${oldName}`)) return prev;
      const next = new Set(prev);
      next.delete(`pin:${oldName}`);
      next.add(`pin:${newName}`);
      return next;
    });
  };

  const removeSectionEntirely = async (section: string) => {
    const updated = await api.removeSection(section);
    setReposLocal({ repos: updated });
    setConfirmRemoveSection(null);
  };

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

  // The effect above only recomputes dirty/aheadBehind when the repo *list* changes (add/remove),
  // so a commit or other git activity in an already-listed repo never refreshed its dot here —
  // unlike the Changes tab, which does subscribe to repo-changed (see useRepoStore). Refresh just
  // the affected repo on each event instead of redoing the full list.
  useEffect(() => {
    const unlisten = listen<string>("repo-changed", (event) => {
      const path = event.payload;
      void api
        .isDirty(path)
        .catch(() => false)
        .then((isDirty) => setDirty((prev) => ({ ...prev, [path]: isDirty })));
      void api
        .getAheadBehind(path)
        .catch(() => ({ ahead: 0, behind: 0, published: true }))
        .then((ab) => setAheadBehind((prev) => ({ ...prev, [path]: ab })));
    });
    return () => {
      void unlisten.then((f) => f());
    };
  }, []);

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
        r.sections.some((s) => s.toLowerCase().includes(needle)),
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

  const pinned = useMemo(
    () => (sidebarSort === "group" ? pinnedGroups(sorted) : new Map<string, RepoEntry[]>()),
    [sorted, sidebarSort],
  );

  const grouped = useMemo(() => {
    if (sidebarSort !== "group") {
      return new Map([["", sorted]]);
    }
    const groups = groupRepos(sorted);
    for (const list of groups.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return new Map([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)));
  }, [sorted, sidebarSort]);

  const allSectionKeys = useMemo(() => {
    const keys: string[] = [];
    for (const section of pinned.keys()) keys.push(`pin:${section}`);
    for (const group of grouped.keys()) if (group) keys.push(`grp:${group}`);
    return keys;
  }, [pinned, grouped]);

  const allSectionsCollapsed =
    allSectionKeys.length > 0 && allSectionKeys.every((key) => collapsedSections.has(key));

  const toggleAllSections = () => {
    setCollapsedSections(allSectionsCollapsed ? new Set() : new Set(allSectionKeys));
  };

  const knownSections = useMemo(
    () => Array.from(new Set(repos.flatMap((r) => r.sections))).sort((a, b) => a.localeCompare(b)),
    [repos],
  );

  const addSection = async (section: string) => {
    if (!pinSectionRepo) return;
    const targetPath = pinSectionRepo.path;
    const updated = await api.addRepoSection(targetPath, section);
    setReposLocal({ repos: updated });
    setPinSectionRepo((current) =>
      current?.path === targetPath ? updated.find((r) => r.path === targetPath) ?? current : current,
    );
  };

  const removeSection = async (path: string, section: string) => {
    const updated = await api.removeRepoSection(path, section);
    setReposLocal({ repos: updated });
    setPinSectionRepo((current) =>
      current?.path === path ? updated.find((r) => r.path === path) ?? current : current,
    );
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
      style={{ width: collapsed ? 48 : width }}
      className={cn(
        "flex h-full shrink-0 flex-col overflow-hidden rounded-xl bg-card shadow-md transition-[width] duration-150 ease-in-out",
        dragOver && "ring-2 ring-inset ring-primary",
      )}
    >
      {collapsed ? (
        <>
          <div className="flex shrink-0 flex-col items-center gap-2 border-b border-border p-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => setCollapsed(false)}>
                  <PanelLeftOpenIcon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Expand sidebar</TooltipContent>
            </Tooltip>
            <AddRepoMenu />
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
        <div className="flex items-center justify-between gap-2">
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
        <div className="flex items-center gap-2">
          <Input
            placeholder="Filter repositories"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-9"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="secondary" size="icon" className="shrink-0" onClick={toggleAllSections}>
                {allSectionsCollapsed ? (
                  <ChevronsUpDownIcon className="size-4" />
                ) : (
                  <ChevronsDownUpIcon className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{allSectionsCollapsed ? "Expand all sections" : "Collapse all sections"}</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-1">
        {filtered.length === 0 && (
          <div className="p-3 text-center text-sm text-muted-foreground">
            {repos.length === 0 ? 'Use "+" to add a repository' : "No matches"}
          </div>
        )}
        {[...pinned.entries()].map(([section, sectionRepos]) => {
          const collapseKey = `pin:${section}`;
          const isCollapsed = collapsedSections.has(collapseKey);
          const visibleRepos = sectionRepos.filter(
            (repo) => !isCollapsed || repo.path === selectedRepo,
          );
          return (
            <div key={collapseKey}>
              {renamingSection === section ? (
                <div className="flex items-center gap-1 px-2 pt-2 pb-1">
                  <PinIcon className="size-3 shrink-0 text-muted-foreground" />
                  <Input
                    autoFocus
                    value={renameSectionValue}
                    onChange={(e) => setRenameSectionValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void commitRenameSection();
                      if (e.key === "Escape") setRenamingSection(null);
                    }}
                    onBlur={() => void commitRenameSection()}
                    className="h-6 text-xs"
                  />
                </div>
              ) : (
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <button
                      className="flex w-full items-center gap-1 px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                      onClick={() => toggleSectionCollapsed(collapseKey)}
                    >
                      {isCollapsed ? (
                        <ChevronRightIcon className="size-3 shrink-0" />
                      ) : (
                        <ChevronDownIcon className="size-3 shrink-0" />
                      )}
                      <PinIcon className="size-3 shrink-0" />
                      <span className="truncate">{section}</span>
                    </button>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onSelect={() => toggleSectionCollapsed(collapseKey)}>
                      {isCollapsed ? (
                        <ChevronRightIcon className="size-3.5" />
                      ) : (
                        <ChevronDownIcon className="size-3.5" />
                      )}
                      {isCollapsed ? "Expand" : "Collapse"}
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={() => startRenameSection(section)}>
                      <PencilIcon className="size-3.5" />
                      Rename Section…
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem variant="destructive" onSelect={() => setConfirmRemoveSection(section)}>
                      <Trash2Icon className="size-3.5" />
                      Remove Section
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              )}
              {visibleRepos.map((repo) => (
                <RepoRow
                  key={repo.path}
                  repo={repo}
                  selected={selectedRepo === repo.path}
                  syncingHere={syncing && selectedRepo === repo.path}
                  dirty={!!dirty[repo.path]}
                  ab={aheadBehind[repo.path]}
                  showAheadBehind={showAheadBehind}
                  draggable={false}
                  dragged={false}
                  confirmRemove={confirmRemovePath === repo.path}
                  onSelect={() => void selectRepo(repo.path)}
                  onDragStart={() => {}}
                  onDragOver={() => {}}
                  onDrop={() => {}}
                  onDragEnd={() => {}}
                  onConfirmRemoveChange={(open) => setConfirmRemovePath(open ? repo.path : null)}
                  onRemove={() => void removeRepo(repo.path)}
                  onPinToSection={() => setPinSectionRepo(repo)}
                  sectionContext={section}
                  onRemoveFromSection={() => void removeSection(repo.path, section)}
                />
              ))}
            </div>
          );
        })}
        {[...grouped.entries()].map(([group, groupRepos]) => {
          const collapseKey = `grp:${group}`;
          const isCollapsed = group !== "" && collapsedSections.has(collapseKey);
          const visibleRepos = groupRepos.filter(
            (repo) => !isCollapsed || repo.path === selectedRepo,
          );
          return (
            <div key={group}>
              {group && (
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <button
                      className="flex w-full items-center gap-1 px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                      onClick={() => toggleSectionCollapsed(collapseKey)}
                    >
                      {isCollapsed ? (
                        <ChevronRightIcon className="size-3 shrink-0" />
                      ) : (
                        <ChevronDownIcon className="size-3 shrink-0" />
                      )}
                      <span className="truncate">{group}</span>
                    </button>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onSelect={() => toggleSectionCollapsed(collapseKey)}>
                      {isCollapsed ? (
                        <ChevronRightIcon className="size-3.5" />
                      ) : (
                        <ChevronDownIcon className="size-3.5" />
                      )}
                      {isCollapsed ? "Expand" : "Collapse"}
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              )}
              {visibleRepos.map((repo) => (
              <RepoRow
                key={repo.path}
                repo={repo}
                selected={selectedRepo === repo.path}
                syncingHere={syncing && selectedRepo === repo.path}
                dirty={!!dirty[repo.path]}
                ab={aheadBehind[repo.path]}
                showAheadBehind={showAheadBehind}
                draggable={sidebarSort === "manual"}
                dragged={draggedPath === repo.path}
                confirmRemove={confirmRemovePath === repo.path}
                onSelect={() => void selectRepo(repo.path)}
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
                onConfirmRemoveChange={(open) => setConfirmRemovePath(open ? repo.path : null)}
                onRemove={() => void removeRepo(repo.path)}
                onPinToSection={() => setPinSectionRepo(repo)}
              />
              ))}
            </div>
          );
        })}
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
    <PinToSectionDialog
      repo={pinSectionRepo}
      sections={knownSections}
      onOpenChange={(open) => !open && setPinSectionRepo(null)}
      onAddSection={(section) => void addSection(section)}
      onRemoveSection={(section) => pinSectionRepo && void removeSection(pinSectionRepo.path, section)}
    />
    <Dialog
      open={confirmRemoveSection !== null}
      onOpenChange={(open) => !open && setConfirmRemoveSection(null)}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Remove Section</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Remove "{confirmRemoveSection}"? Every repo pinned to it will be unpinned; nothing else
          about them changes.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setConfirmRemoveSection(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => confirmRemoveSection && void removeSectionEntirely(confirmRemoveSection)}
          >
            Remove Section
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </div>
  );
}
