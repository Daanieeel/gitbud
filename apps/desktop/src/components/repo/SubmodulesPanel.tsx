import { useState } from "react";
import { BoxIcon, DownloadIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@gitbud/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@gitbud/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gitbud/ui/tooltip";
import { useRepoStore } from "@/store/useRepoStore";
import {
  useSubmodules,
  useUpdateAllSubmodules,
  useUpdateSubmodule,
} from "@/hooks/queries/useSubmodules";
import { cn } from "@gitbud/ui/utils";

export function SubmodulesPanel() {
  const repoPath = useRepoStore((s) => s.selectedRepo);
  const { data: submodules } = useSubmodules(repoPath);
  const updateSubmodule = useUpdateSubmodule(repoPath);
  const updateAllSubmodules = useUpdateAllSubmodules(repoPath);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const busy = busyKey !== null;

  if (!repoPath || submodules.length === 0) return null;

  const runBusy = async (key: string, fn: () => Promise<void>) => {
    const startedAt = Date.now();
    setBusyKey(key);
    try {
      await fn();
    } finally {
      const elapsed = Date.now() - startedAt;
      if (elapsed < 400) await new Promise((resolve) => setTimeout(resolve, 400 - elapsed));
      setBusyKey(null);
    }
  };

  const updateOne = (path: string) => runBusy(path, () => updateSubmodule.mutateAsync(path));

  const updateAll = () => runBusy("__all__", () => updateAllSubmodules.mutateAsync());

  const uninitialized = submodules.filter((s) => !s.initialized).length;

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="secondary" size="sm">
              <BoxIcon className="size-3.5" />
              {submodules.length}
              {uninitialized > 0 && <span className="text-accent-yellow">!</span>}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>
          Submodules are nested git repositories checked out at a specific commit inside this one
        </TooltipContent>
      </Tooltip>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="max-h-56 overflow-auto p-1">
          {submodules.map((sub) => (
            <div key={sub.path} className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="min-w-0 flex-1 truncate">
                    {sub.path}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{sub.url ?? undefined}</TooltipContent>
              </Tooltip>
              {sub.initialized ? (
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {sub.head_oid?.slice(0, 7)}
                </span>
              ) : (
                <span className="shrink-0 text-xs text-accent-yellow">not initialized</span>
              )}
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => void updateOne(sub.path)}
              >
                {sub.initialized ? (
                  <RefreshCwIcon className={cn("size-3.5", busyKey === sub.path && "animate-spin")} />
                ) : (
                  <DownloadIcon className={cn("size-3.5", busyKey === sub.path && "animate-spin")} />
                )}
                {busyKey === sub.path
                  ? sub.initialized ? "Updating…" : "Initializing…"
                  : sub.initialized ? "Update" : "Init"}
              </Button>
            </div>
          ))}
        </div>
        <div className="border-t border-border p-2">
          <Button size="sm" className="w-full" disabled={busy} onClick={() => void updateAll()}>
            <RefreshCwIcon className={cn("size-3.5", busyKey === "__all__" && "animate-spin")} />
            {busyKey === "__all__" ? "Updating…" : "Update All Submodules"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
