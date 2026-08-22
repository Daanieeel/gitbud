import { WifiOffIcon } from "lucide-react";
import { useNetworkStore } from "@/store/useNetworkStore";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function OfflineIndicator() {
  const offline = useNetworkStore((s) => s.offline);
  if (!offline) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
          <WifiOffIcon className="size-3.5" />
          Offline
        </span>
      </TooltipTrigger>
      <TooltipContent>
        Can't reach the remote — fetch/pull/push and PR data may be stale until connectivity is back
      </TooltipContent>
    </Tooltip>
  );
}
