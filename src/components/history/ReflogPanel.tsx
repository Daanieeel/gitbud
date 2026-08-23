import { useEffect, useState } from "react";
import { HistoryIcon, RotateCcwIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRepoStore } from "@/store/useRepoStore";
import { useReflogEntries, useReflogRestore } from "@/hooks/queries/useReflog";
import { queryKeys } from "@/lib/queryKeys";

export function ReflogPanel() {
  const repoPath = useRepoStore((s) => s.selectedRepo);
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const { data: entries } = useReflogEntries(repoPath, open);
  const restoreMutation = useReflogRestore(repoPath);

  // Force a fresh fetch every time this dialog opens — HEAD can have moved (commit, checkout,
  // another sync) since the last time it was open, well within staleTime's window.
  useEffect(() => {
    if (open && repoPath) void queryClient.invalidateQueries({ queryKey: queryKeys.reflog(repoPath) });
  }, [open, repoPath, queryClient]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOid, setConfirmOid] = useState<string | null>(null);

  if (!repoPath) return null;

  const restore = async (oid: string) => {
    setBusy(true);
    setError(null);
    try {
      await restoreMutation.mutateAsync(oid);
      setConfirmOid(null);
      setOpen(false);
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
