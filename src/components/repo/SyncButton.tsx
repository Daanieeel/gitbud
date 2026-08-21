import { formatDistanceToNow } from "date-fns";
import { ArrowDownIcon, ArrowUpIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRepoStore } from "@/store/useRepoStore";
import { cn } from "@/lib/utils";

export function SyncButton() {
  const selectedRepo = useRepoStore((s) => s.selectedRepo);
  const repos = useRepoStore((s) => s.repos);
  const aheadBehind = useRepoStore((s) => s.aheadBehind);
  const syncing = useRepoStore((s) => s.syncing);
  const fetch = useRepoStore((s) => s.fetch);
  const pull = useRepoStore((s) => s.pull);
  const push = useRepoStore((s) => s.push);

  const lastFetched = repos.find((r) => r.path === selectedRepo)?.last_fetched ?? null;

  if (!selectedRepo) return null;

  let label = "Fetch origin";
  let Icon = RefreshCwIcon;
  let action = fetch;
  if (aheadBehind.behind > 0) {
    label = `Pull origin (${aheadBehind.behind})`;
    Icon = ArrowDownIcon;
    action = pull;
  } else if (aheadBehind.ahead > 0) {
    label = `Push origin (${aheadBehind.ahead})`;
    Icon = ArrowUpIcon;
    action = push;
  }

  return (
    <div className="flex flex-col items-start">
      <Button variant="outline" size="sm" disabled={syncing} onClick={() => void action()}>
        <Icon className={cn("size-3.5", syncing && "animate-spin")} />
        {label}
      </Button>
      <span className="pl-1 text-[10px] text-muted-foreground">
        {lastFetched
          ? `Last fetched ${formatDistanceToNow(new Date(lastFetched * 1000), { addSuffix: true })}`
          : "Never fetched"}
      </span>
    </div>
  );
}
