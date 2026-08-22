import { useEffect, useState } from "react";
import { HistoryIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/tauri";
import { useRepoStore } from "@/store/useRepoStore";
import type { ReflogEntry } from "@/lib/types";

export function ReflogPanel() {
  const repoPath = useRepoStore((s) => s.selectedRepo);
  const refreshStatus = useRepoStore((s) => s.refreshStatus);
  const refreshBranches = useRepoStore((s) => s.refreshBranches);
  const resetHistory = useRepoStore((s) => s.resetHistory);

  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<ReflogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOid, setConfirmOid] = useState<string | null>(null);

  useEffect(() => {
    if (open && repoPath) void api.getReflog(repoPath).then(setEntries);
  }, [open, repoPath]);

  if (!repoPath) return null;

  const restore = async (oid: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.reflogRestore(repoPath, oid);
      setConfirmOid(null);
      setOpen(false);
      await Promise.all([refreshStatus(), refreshBranches(), resetHistory()]);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            <HistoryIcon className="size-3.5" />
            Reflog
          </Button>
        </TooltipTrigger>
        <TooltipContent>Undo a reset, rebase, or accidental branch move</TooltipContent>
      </Tooltip>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Reflog</DialogTitle>
            <DialogDescription>
              Every place HEAD has pointed in this repo, most recent first. Restoring hard-resets
              HEAD and the working tree to that point, but that too is recorded here, so it can
              be undone the same way.
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="max-h-96 overflow-auto">
            {entries.map((entry) => (
              <div
                key={entry.index}
                className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
              >
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {entry.oid.slice(0, 7)}
                </span>
                <span className="min-w-0 flex-1 truncate">{entry.message}</span>
                {confirmOid === entry.oid ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => void restore(entry.oid)}
                  >
                    Confirm reset
                  </Button>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => setConfirmOid(entry.oid)}
                      >
                        <RotateCcwIcon className="size-3.5" />
                        Restore
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Restore to here (hard reset)</TooltipContent>
                  </Tooltip>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
