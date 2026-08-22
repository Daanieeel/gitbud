import { useEffect, useMemo, useState } from "react";
import { GripVerticalIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/tauri";
import { useRepoStore } from "@/store/useRepoStore";
import type { CommitEntry } from "@/lib/types";

type Action = "pick" | "squash" | "drop";

interface Row {
  commit: CommitEntry;
  action: Action;
}

const ACTIONS: Action[] = ["pick", "squash", "drop"];

interface InteractiveRebaseDialogProps {
  /** The commit to rebase onto — everything after it (down to HEAD) is up for reordering. */
  baseOid: string | null;
  onOpenChange: (open: boolean) => void;
}

export function InteractiveRebaseDialog({ baseOid, onOpenChange }: InteractiveRebaseDialogProps) {
  const repoPath = useRepoStore((s) => s.selectedRepo);
  const commits = useRepoStore((s) => s.commits);
  const refreshStatus = useRepoStore((s) => s.refreshStatus);
  const resetHistory = useRepoStore((s) => s.resetHistory);

  const initialRows = useMemo<Row[]>(() => {
    if (!baseOid) return [];
    const baseIndex = commits.findIndex((c) => c.oid === baseOid);
    if (baseIndex <= 0) return [];
    // commits[0..baseIndex] is newest-first; rebase replays oldest-first.
    return commits
      .slice(0, baseIndex)
      .reverse()
      .map((commit) => ({ commit, action: "pick" as Action }));
  }, [baseOid, commits]);

  const [rows, setRows] = useState<Row[]>(initialRows);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset local state whenever a new base is chosen (dialog re-opens).
  useEffect(() => {
    if (baseOid) {
      setRows(initialRows);
      setError(null);
    }
    // Only when the dialog target changes, not on every commits/initialRows recompute.
  }, [baseOid]);

  const cycleAction = (index: number) => {
    setRows((prev) =>
      prev.map((row, i) =>
        i === index ? { ...row, action: ACTIONS[(ACTIONS.indexOf(row.action) + 1) % ACTIONS.length] } : row,
      ),
    );
  };

  const reorder = (from: number, to: number) => {
    setRows((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const close = () => {
    setRows([]);
    setError(null);
    onOpenChange(false);
  };

  const start = async () => {
    if (!repoPath || !baseOid) return;
    setRunning(true);
    setError(null);
    try {
      const result = await api.interactiveRebase(
        repoPath,
        baseOid,
        rows.map((r) => ({ oid: r.commit.oid, action: r.action })),
      );
      if (result.success) {
        await Promise.all([refreshStatus(), resetHistory()]);
        close();
      } else {
        setError(
          `Stopped at "${result.conflicted_summary ?? result.conflicted_oid}" — it doesn't apply cleanly here. Nothing was changed; adjust the plan (e.g. drop it) and try again.`,
        );
      }
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={baseOid != null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Interactive Rebase</DialogTitle>
          <DialogDescription>
            Drag to reorder, click the action to cycle pick → squash → drop. Any conflict aborts
            cleanly with no changes made — there's no partial state to recover from.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-96 overflow-auto rounded-md border border-border">
          {rows.map((row, index) => (
            <div
              key={row.commit.oid}
              draggable
              onDragStart={() => setDragIndex(index)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex !== null && dragIndex !== index) reorder(dragIndex, index);
                setDragIndex(null);
              }}
              className={cn(
                "flex items-center gap-2 border-b border-border px-2 py-1.5 text-sm last:border-b-0",
                row.action === "drop" && "opacity-40",
              )}
            >
              <GripVerticalIcon className="size-4 shrink-0 cursor-grab text-muted-foreground" />
              <button
                onClick={() => cycleAction(index)}
                className={cn(
                  "w-16 shrink-0 rounded px-1.5 py-0.5 text-center text-xs font-medium uppercase",
                  row.action === "pick" && "bg-accent-green/20 text-accent-green",
                  row.action === "squash" && "bg-accent-yellow/20 text-accent-yellow",
                  row.action === "drop" && "bg-destructive/20 text-destructive",
                )}
              >
                {row.action}
              </button>
              <span className="truncate">{row.commit.summary}</span>
              <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
                {row.commit.short_oid}
              </span>
            </div>
          ))}
          {rows.length === 0 && (
            <div className="p-4 text-center text-sm text-muted-foreground">Nothing to rebase</div>
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button disabled={running || rows.length === 0} onClick={() => void start()}>
            {running ? "Rebasing…" : "Start Rebase"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
