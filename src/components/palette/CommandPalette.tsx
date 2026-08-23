import { useEffect, useMemo, useState } from "react";
import { GitBranchIcon, GitCommitIcon, FolderGitIcon, FileIcon } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/tauri";
import { useRepoStore } from "@/store/useRepoStore";
import { useBranches, useCheckoutBranch } from "@/hooks/queries/useBranches";
import { useStatus } from "@/hooks/queries/useRepoStatus";
import type { CommitSearchResult } from "@/lib/types";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** "all" shows repos/branches/files/commits; "repos" narrows to just repo switching (Cmd+K). */
  mode: "all" | "repos";
}

type Entry =
  | { kind: "repo"; key: string; label: string; sublabel: string; path: string }
  | { kind: "branch"; key: string; label: string; sublabel: string; name: string }
  | { kind: "file"; key: string; label: string; sublabel: string; path: string }
  | { kind: "commit"; key: string; label: string; sublabel: string; oid: string };

export function CommandPalette({ open, onOpenChange, mode }: CommandPaletteProps) {
  const repos = useRepoStore((s) => s.repos);
  const selectedRepo = useRepoStore((s) => s.selectedRepo);
  const { data: branchData } = useBranches(selectedRepo);
  const branches = branchData?.branches ?? [];
  const { data: status } = useStatus(selectedRepo);
  const selectRepo = useRepoStore((s) => s.selectRepo);
  const checkoutBranchMutation = useCheckoutBranch(selectedRepo);
  const selectFile = useRepoStore((s) => s.selectFile);
  const selectCommit = useRepoStore((s) => s.selectCommit);
  const setActiveTab = useRepoStore((s) => s.setActiveTab);

  const [query, setQuery] = useState("");
  const [commitResults, setCommitResults] = useState<CommitSearchResult[]>([]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  useEffect(() => {
    if (mode !== "all" || !selectedRepo || query.trim().length < 2) {
      setCommitResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void api.searchCommits(selectedRepo, query.trim(), 15).then((r) => !cancelled && setCommitResults(r));
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mode, selectedRepo, query]);

  const entries = useMemo<Entry[]>(() => {
    const needle = query.trim().toLowerCase();
    const matches = (s: string) => !needle || s.toLowerCase().includes(needle);

    const repoEntries: Entry[] = repos
      .filter((r) => matches(r.name))
      .map((r) => ({ kind: "repo", key: `repo:${r.path}`, label: r.name, sublabel: r.group, path: r.path }));

    if (mode === "repos") return repoEntries;

    const branchEntries: Entry[] = branches
      .filter((b) => !b.is_remote && matches(b.name))
      .map((b) => ({ kind: "branch", key: `branch:${b.name}`, label: b.name, sublabel: "branch", name: b.name }));

    const fileEntries: Entry[] = (status?.files ?? [])
      .filter((f) => matches(f.path))
      .map((f) => ({ kind: "file", key: `file:${f.path}`, label: f.path, sublabel: "changed file", path: f.path }));

    const commitEntries: Entry[] = commitResults.map((c) => ({
      kind: "commit",
      key: `commit:${c.oid}`,
      label: c.summary,
      sublabel: `${c.short_oid} · ${c.author_name}`,
      oid: c.oid,
    }));

    return [...repoEntries, ...branchEntries, ...fileEntries, ...commitEntries];
  }, [query, repos, branches, status, commitResults, mode]);

  const activate = (entry: Entry) => {
    switch (entry.kind) {
      case "repo":
        void selectRepo(entry.path);
        break;
      case "branch":
        checkoutBranchMutation.mutate(entry.name);
        break;
      case "file":
        setActiveTab("changes");
        selectFile(entry.path);
        break;
      case "commit":
        setActiveTab("history");
        selectCommit(entry.oid);
        break;
    }
    onOpenChange(false);
  };

  const icon = (kind: Entry["kind"]) => {
    switch (kind) {
      case "repo":
        return <FolderGitIcon className="size-4 shrink-0 text-muted-foreground" />;
      case "branch":
        return <GitBranchIcon className="size-4 shrink-0 text-muted-foreground" />;
      case "file":
        return <FileIcon className="size-4 shrink-0 text-muted-foreground" />;
      case "commit":
        return <GitCommitIcon className="size-4 shrink-0 text-muted-foreground" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-0 p-0">
        <Input
          autoFocus
          placeholder={mode === "repos" ? "Switch repository…" : "Search branches, commits, changed files…"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && entries[0]) activate(entries[0]);
          }}
          className="h-11 rounded-none border-0 border-b border-border focus-visible:ring-0"
        />
        <div className="max-h-80 overflow-auto p-1">
          {entries.length === 0 && (
            <div className="p-4 text-center text-sm text-muted-foreground">No matches</div>
          )}
          {entries.map((entry) => (
            <div
              key={entry.key}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
              onClick={() => activate(entry)}
            >
              {icon(entry.kind)}
              <span className="min-w-0 flex-1 truncate">{entry.label}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{entry.sublabel}</span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
