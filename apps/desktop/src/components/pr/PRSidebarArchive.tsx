import { ArchiveIcon, ArchiveRestoreIcon } from "lucide-react";
import { Button } from "@gitbud/ui/button";
import { useIsPrArchived, useSetPrArchived } from "@/hooks/queries/usePrArchive";
import type { PullRequest } from "@/lib/types";

interface PRSidebarArchiveProps {
  repoPath: string;
  pr: PullRequest;
}

/** Below the lock-conversation button — a gitbud-only bookkeeping flag (no GitHub API for this
 * at all) for setting an open PR aside without touching anything on GitHub's side. Only shown
 * for open PRs — a closed/merged one is already off your plate. */
export function PRSidebarArchive({ repoPath, pr }: PRSidebarArchiveProps) {
  const { data: archived = false } = useIsPrArchived(repoPath, pr.number);
  const setArchived = useSetPrArchived(repoPath, pr.number);

  if (pr.merged || pr.state !== "open") return null;

  return (
    <Button
      size="sm"
      variant="ghost"
      className="w-full justify-start text-muted-foreground"
      disabled={setArchived.isPending}
      onClick={() => setArchived.mutate(!archived)}
    >
      {archived ? (
        <>
          <ArchiveRestoreIcon className="size-3.5" />
          Unarchive pull request
        </>
      ) : (
        <>
          <ArchiveIcon className="size-3.5" />
          Archive pull request
        </>
      )}
    </Button>
  );
}
