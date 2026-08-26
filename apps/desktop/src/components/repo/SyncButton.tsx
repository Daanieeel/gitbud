import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, CloudUploadIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@gitbud/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gitbud/ui/tooltip";
import { useRepoStore } from "@/store/useRepoStore";
import { useBranches } from "@/hooks/queries/useBranches";
import { useAheadBehind, DEFAULT_AHEAD_BEHIND } from "@/hooks/queries/useAheadBehind";
import { useGitSync } from "@/hooks/queries/useGitSync";
import { useIdentityAvailability } from "@/hooks/useIdentityAvailability";
import { cn } from "@gitbud/ui/utils";

export function SyncButton() {
  const selectedRepo = useRepoStore((s) => s.selectedRepo);
  const { data: branchData } = useBranches(selectedRepo);
  const { data: aheadBehind = DEFAULT_AHEAD_BEHIND } = useAheadBehind(selectedRepo);
  const { syncing, fetch, pull, push, syncBranch } = useGitSync(selectedRepo, branchData?.branch ?? null);
  const { available, reason } = useIdentityAvailability();

  if (!selectedRepo) return null;

  let label = "Fetch origin";
  let Icon = RefreshCwIcon;
  let action = fetch;
  let title = `${label} (Cmd+Shift+P to pull)`;
  let variant: "secondary" | "default" = "secondary";
  if (!aheadBehind.published) {
    label = "Publish branch";
    Icon = CloudUploadIcon;
    action = push;
    title = "This branch has never been pushed. Publish it to origin";
    variant = "default";
  } else if (aheadBehind.behind > 0 && aheadBehind.ahead > 0) {
    label = `Sync (${aheadBehind.behind}↓ ${aheadBehind.ahead}↑)`;
    Icon = ArrowUpDownIcon;
    action = syncBranch;
    title = "Pulls, then pushes. If the pull conflicts with your local commit(s), aborts and suggests a safer manual path instead of pushing";
    variant = "default";
  } else if (aheadBehind.behind > 0) {
    label = `Pull origin (${aheadBehind.behind})`;
    Icon = ArrowDownIcon;
    action = pull;
    title = `${label} (Cmd+Shift+P to pull)`;
  } else if (aheadBehind.ahead > 0) {
    label = `Push origin (${aheadBehind.ahead})`;
    Icon = ArrowUpIcon;
    action = push;
    title = `${label} (Cmd+Shift+P to pull)`;
    variant = "default";
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={variant}
          size="sm"
          disabled={syncing}
          className={cn(!available && "cursor-not-allowed opacity-50 hover:bg-accent")}
          onClick={() => {
            if (!available) return;
            void action();
          }}
        >
          <Icon className={cn("size-3.5", syncing && "animate-spin")} />
          {label}
        </Button>
      </TooltipTrigger>
      <TooltipContent className={cn(!available && "border-destructive bg-destructive text-destructive-foreground")}>
        {available ? title : reason}
      </TooltipContent>
    </Tooltip>
  );
}
