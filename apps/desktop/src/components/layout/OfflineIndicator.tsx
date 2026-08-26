import { WifiOffIcon } from "lucide-react";
import { useNetworkStore } from "@/store/useNetworkStore";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gitbud/ui/tooltip";

export function OfflineIndicator({ iconOnly }: { iconOnly?: boolean }) {
  const offline = useNetworkStore((s) => s.offline);
  if (!offline) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {iconOnly ? (
          <span className="flex items-center justify-center rounded-md bg-destructive/10 p-1.5 text-destructive">
            <WifiOffIcon className="size-3.5" />
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
            <WifiOffIcon className="size-3.5" />
            Offline
          </span>
        )}
      </TooltipTrigger>
      <TooltipContent>
        Can't reach the remote, so fetch, pull, push, and PR data may be stale until connectivity is back
      </TooltipContent>
    </Tooltip>
  );
}
