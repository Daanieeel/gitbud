import { DatabaseIcon, DownloadIcon, UploadIcon } from "lucide-react";
import { Button } from "@gitbud/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@gitbud/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gitbud/ui/tooltip";
import { useRepoStore } from "@/store/useRepoStore";
import { useHasLfs } from "@/hooks/queries/useLfs";
import { useBranches } from "@/hooks/queries/useBranches";
import { useGitSync } from "@/hooks/queries/useGitSync";
import { cn } from "@gitbud/ui/utils";

export function LfsPanel() {
  const repoPath = useRepoStore((s) => s.selectedRepo);
  const { data: branchData } = useBranches(repoPath);
  const { syncing, pullLfs, pushLfs } = useGitSync(repoPath, branchData?.branch ?? null);
  const { data: hasLfs } = useHasLfs(repoPath);

  if (!repoPath || !hasLfs) return null;

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="secondary" size="sm">
              <DatabaseIcon className="size-3.5" />
              LFS
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>This repo tracks large files via Git LFS</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-64 p-2" align="start">
        <p className="mb-2 text-xs text-muted-foreground">
          This repo tracks large files with Git LFS. Fetch/pull/push don't always transfer LFS
          objects on their own. Use these if a large file looks stuck as a pointer.
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            disabled={syncing}
            onClick={() => void pullLfs()}
          >
            <DownloadIcon className={cn("size-3.5", syncing && "animate-spin")} />
            {syncing ? "Working…" : "Pull LFS"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="flex-1"
            disabled={syncing}
            onClick={() => void pushLfs()}
          >
            <UploadIcon className={cn("size-3.5", syncing && "animate-spin")} />
            {syncing ? "Working…" : "Push LFS"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
