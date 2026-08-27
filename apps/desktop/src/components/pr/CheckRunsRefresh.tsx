import { useEffect, useState } from "react";
import { RefreshCwIcon, WifiOffIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gitbud/ui/tooltip";
import { cn } from "@gitbud/ui/utils";
import { useNetworkStore } from "@/store/useNetworkStore";

interface CheckRunsRefreshProps {
  /** From useCheckRuns's `dataUpdatedAt` — when the currently-shown result was fetched. */
  dataUpdatedAt: number;
  isFetching: boolean;
  onRefresh: () => void;
  /** From checkRunsPollInterval(runs) — null means nothing's currently auto-polling (every
   * check has already settled), so there's no countdown to show, just the manual button. */
  pollIntervalMs: number | null;
}

/** A manual refresh button plus a live countdown to the next automatic poll — shown everywhere
 * CI status is displayed (CIBadge's popover, MergePRDialog's checks section) so the polling
 * happening underneath isn't an invisible black box, and there's always a way to force a check
 * right now instead of waiting on it. The 1s countdown tick only runs while this is actually
 * mounted (the popover/dialog is open), not for every CI badge on screen. */
export function CheckRunsRefresh({
  dataUpdatedAt,
  isFetching,
  onRefresh,
  pollIntervalMs,
}: CheckRunsRefreshProps) {
  const [now, setNow] = useState(() => Date.now());
  const offline = useNetworkStore((s) => s.offline);

  useEffect(() => {
    if (pollIntervalMs === null) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [pollIntervalMs]);

  const secondsLeft =
    pollIntervalMs !== null
      ? Math.max(0, Math.ceil((dataUpdatedAt + pollIntervalMs - now) / 1000))
      : null;

  return (
    <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
      {offline ? (
        <span className="flex items-center gap-1 text-destructive">
          <WifiOffIcon className="size-3.5" />
          Offline
        </span>
      ) : (
        secondsLeft !== null && <span>Refreshing in {secondsLeft}s</span>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="text-muted-foreground hover:text-foreground disabled:opacity-50"
            disabled={isFetching}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRefresh();
            }}
          >
            <RefreshCwIcon className={cn("size-3.5", isFetching && "animate-spin")} />
          </button>
        </TooltipTrigger>
        <TooltipContent>Refresh checks now</TooltipContent>
      </Tooltip>
    </div>
  );
}
