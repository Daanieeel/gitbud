import { useState } from "react";
import { GitMergeIcon, ListOrderedIcon } from "lucide-react";
import { Button } from "@gitbud/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@gitbud/ui/dialog";
import { useResolveDivergedPull } from "@/hooks/queries/useGitSync";
import { useDivergedPullStore } from "@/store/useDivergedPullStore";

/** Surfaces git's own "Diverging branches can't be fast-forwarded" failure (hit when the pull
 * strategy is set to fast-forward-only and both sides have new commits) as an actual choice
 * instead of a dead-end error toast — the same two options git's hint text offers. */
export function ResolveDivergedPullDialog() {
  const repoPath = useDivergedPullStore((s) => s.repoPath);
  const close = useDivergedPullStore((s) => s.close);
  const resolveMutation = useResolveDivergedPull(repoPath);
  const [resolving, setResolving] = useState<"merge" | "rebase" | null>(null);

  const resolve = async (strategy: "merge" | "rebase") => {
    setResolving(strategy);
    try {
      await resolveMutation.mutateAsync(strategy);
      close();
    } finally {
      setResolving(null);
    }
  };

  return (
    <Dialog open={repoPath !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Branches have diverged</DialogTitle>
          <DialogDescription>
            Your branch and origin both have commits the other doesn't, so a fast-forward pull
            isn't possible. Choose how to reconcile them.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Button
            variant="secondary"
            className="h-auto justify-start gap-2 py-2 text-left"
            disabled={resolving !== null}
            onClick={() => void resolve("merge")}
          >
            <GitMergeIcon className="size-4 shrink-0" />
            <span className="flex flex-col">
              <span className="text-sm font-medium">{resolving === "merge" ? "Merging…" : "Merge"}</span>
              <span className="text-xs text-muted-foreground">Combine both histories with a merge commit</span>
            </span>
          </Button>
          <Button
            variant="secondary"
            className="h-auto justify-start gap-2 py-2 text-left"
            disabled={resolving !== null}
            onClick={() => void resolve("rebase")}
          >
            <ListOrderedIcon className="size-4 shrink-0" />
            <span className="flex flex-col">
              <span className="text-sm font-medium">{resolving === "rebase" ? "Rebasing…" : "Rebase"}</span>
              <span className="text-xs text-muted-foreground">Replay your local commits on top of origin</span>
            </span>
          </Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" disabled={resolving !== null} onClick={close}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
