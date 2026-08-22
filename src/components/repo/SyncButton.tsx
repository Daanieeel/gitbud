import { ArrowDownIcon, ArrowUpIcon, CloudUploadIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRepoStore } from "@/store/useRepoStore";
import { cn } from "@/lib/utils";

export function SyncButton() {
  const selectedRepo = useRepoStore((s) => s.selectedRepo);
  const aheadBehind = useRepoStore((s) => s.aheadBehind);
  const syncing = useRepoStore((s) => s.syncing);
  const fetch = useRepoStore((s) => s.fetch);
  const pull = useRepoStore((s) => s.pull);
  const push = useRepoStore((s) => s.push);

  if (!selectedRepo) return null;

  let label = "Fetch origin";
  let Icon = RefreshCwIcon;
  let action = fetch;
  let title = `${label} (Cmd+Shift+P to pull)`;
  if (!aheadBehind.published) {
    label = "Publish branch";
    Icon = CloudUploadIcon;
    action = push;
    title = "This branch has never been pushed — publish it to origin";
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
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          disabled={syncing}
          onClick={() => void action()}
        >
          <Icon className={cn("size-3.5", syncing && "animate-spin")} />
          {label}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  );
}
