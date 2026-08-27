import { useState } from "react";
import { PackageIcon, Undo2Icon } from "lucide-react";
import { Button } from "@gitbud/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@gitbud/ui/dialog";
import { useResolveUnstagedPull } from "@/hooks/queries/useGitSync";
import { useUnstagedPullStore } from "@/store/useUnstagedPullStore";

/** Surfaces git's "cannot pull with rebase: You have unstaged changes" failure (hit when the
 * pull strategy is set to rebase and the working tree is dirty) as an actual choice instead of
 * a dead-end error toast. */
export function ResolveUnstagedPullDialog() {
  const repoPath = useUnstagedPullStore((s) => s.repoPath);
  const close = useUnstagedPullStore((s) => s.close);
  const resolveMutation = useResolveUnstagedPull(repoPath);
  const [resolving, setResolving] = useState<"abort" | "stash-and-pull" | null>(null);

  const resolve = async (choice: "abort" | "stash-and-pull") => {
    setResolving(choice);
    try {
      await resolveMutation.mutateAsync(choice);
      close();
    } finally {
      setResolving(null);
    }
  };

  return (
    <Dialog open={repoPath !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>You have uncommitted changes</DialogTitle>
          <DialogDescription>
            Pulling with rebase needs a clean working tree, so it stopped before touching anything.
            Choose how to proceed.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Button
            variant="secondary"
            className="h-auto justify-start gap-2 py-2 text-left"
            disabled={resolving !== null}
            onClick={() => void resolve("stash-and-pull")}
          >
            <PackageIcon className="size-4 shrink-0" />
            <span className="flex flex-col">
              <span className="text-sm font-medium">
                {resolving === "stash-and-pull" ? "Stashing and pulling…" : "Stash & pull"}
              </span>
              <span className="text-xs text-muted-foreground">
                Set your changes aside, pull, then bring them back automatically
              </span>
            </span>
          </Button>
          <Button
            variant="secondary"
            className="h-auto justify-start gap-2 py-2 text-left"
            disabled={resolving !== null}
            onClick={() => void resolve("abort")}
          >
            <Undo2Icon className="size-4 shrink-0" />
            <span className="flex flex-col">
              <span className="text-sm font-medium">
                {resolving === "abort" ? "Aborting…" : "Abort pull"}
              </span>
              <span className="text-xs text-muted-foreground">
                Leave your changes as they are and don't pull
              </span>
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
