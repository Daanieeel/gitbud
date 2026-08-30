import { ArchiveIcon, ArchiveRestoreIcon } from "lucide-react";
import { Button } from "@gitbud/ui/button";
import { useIsPrArchived, useSetPrArchived } from "@/hooks/queries/usePrArchive";
import type { Issue } from "@/lib/types";

interface IssueSidebarArchiveProps {
  repoPath: string;
  issue: Issue;
}

/** Below the lock-conversation button — a gitbud-only bookkeeping flag (no GitHub API for this
 * at all) for setting an open issue aside. Reuses `useIsPrArchived`/`useSetPrArchived` verbatim
 * (already keyed only by repo + number — an issue and PR number never collide, see
 * `pr_cache.rs`'s `pr_archived` table). Only shown for open issues, mirroring
 * `PRSidebarArchive.tsx`. */
export function IssueSidebarArchive({ repoPath, issue }: IssueSidebarArchiveProps) {
  const { data: archived = false } = useIsPrArchived(repoPath, issue.number);
  const setArchived = useSetPrArchived(repoPath, issue.number);

  if (issue.state !== "open") return null;

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
          Unarchive issue
        </>
      ) : (
        <>
          <ArchiveIcon className="size-3.5" />
          Archive issue
        </>
      )}
    </Button>
  );
}
