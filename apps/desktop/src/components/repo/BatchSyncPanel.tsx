import { useEffect } from "react";
import {
  ArrowDownToLineIcon,
  CheckIcon,
  CircleIcon,
  RefreshCwIcon,
  XCircleIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@gitbud/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gitbud/ui/tooltip";
import { useBatchSyncStore } from "@/store/useBatchSyncStore";
import { useRepoStore } from "@/store/useRepoStore";
import { cn } from "@gitbud/ui/utils";
import type { RepoEntry } from "@/lib/types";

const BATCH_TOAST_ID = "batch-sync";

export function BatchSyncTrigger({
  repos,
  totalCount,
  iconOnly,
}: {
  repos: RepoEntry[];
  totalCount: number;
  iconOnly?: boolean;
}) {
  const running = useBatchSyncStore((s) => s.running);
  const runFetchAll = useBatchSyncStore((s) => s.runFetchAll);
  const runPullAll = useBatchSyncStore((s) => s.runPullAll);

  if (repos.length === 0) return null;
  const filtered = repos.length < totalCount;
  const scope = filtered ? "every repo currently matching the filter" : "every repo in the sidebar";
  const suffix = filtered ? ` ${repos.length}/${totalCount}` : " All";

  const run = (kind: "fetch" | "pull") => () => {
    toast.custom((id) => <BatchSyncToastContent toastId={id} />, {
      id: BATCH_TOAST_ID,
      duration: Infinity,
    });
    const paths = repos.map((r) => r.path);
    void (kind === "fetch" ? runFetchAll(paths) : runPullAll(paths));
  };

  if (iconOnly) {
    return (
      <>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="secondary" size="icon" disabled={running} onClick={run("fetch")}>
              <RefreshCwIcon className={cn("size-4", running && "animate-spin")} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Fetch {scope}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="secondary" size="icon" disabled={running} onClick={run("pull")}>
              <ArrowDownToLineIcon className={cn("size-4", running && "animate-pulse")} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Pull {scope}</TooltipContent>
        </Tooltip>
      </>
    );
  }

  return (
    <div className="flex gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            disabled={running}
            onClick={run("fetch")}
          >
            <RefreshCwIcon className={cn("size-3.5", running && "animate-spin")} />
            {`Fetch${suffix}`}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Fetch {scope}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            disabled={running}
            onClick={run("pull")}
          >
            <ArrowDownToLineIcon className={cn("size-3.5", running && "animate-pulse")} />
            {`Pull${suffix}`}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Pull {scope}</TooltipContent>
      </Tooltip>
    </div>
  );
}

function BatchSyncToastContent({ toastId }: { toastId: string | number }) {
  const repos = useRepoStore((s) => s.repos);
  const running = useBatchSyncStore((s) => s.running);
  const kind = useBatchSyncStore((s) => s.kind);
  const outcomes = useBatchSyncStore((s) => s.outcomes);
  const errors = useBatchSyncStore((s) => s.errors);
  const dismiss = useBatchSyncStore((s) => s.dismiss);

  const entries = Object.entries(outcomes);
  const doneCount = entries.filter(([, v]) => v === "done").length;
  const errorCount = entries.filter(([, v]) => v === "error").length;

  // Once every repo has settled, leave the summary up for a few seconds, then clean up.
  useEffect(() => {
    if (running) return;
    const t = setTimeout(() => {
      toast.dismiss(toastId);
      dismiss();
    }, 4000);
    return () => clearTimeout(t);
  }, [running, toastId, dismiss]);

  return (
    <div className="flex w-[22rem] flex-col gap-1.5 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg">
      <div className="flex items-center justify-between text-sm font-medium">
        <span>
          {kind === "fetch" ? "Fetch All" : "Pull All"}: {running ? "running…" : "done"}
        </span>
        <span className="text-xs text-muted-foreground">
          {doneCount}/{entries.length}
          {errorCount > 0 && ` (${errorCount} failed)`}
        </span>
      </div>
      <div className="max-h-56 overflow-auto">
        {entries.map(([path, status]) => {
          const repo = repos.find((r) => r.path === path);
          return (
            <Tooltip key={path}>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-2 py-0.5 text-xs">
                  {status === "pending" && (
                    <CircleIcon className="size-3 shrink-0 text-muted-foreground" />
                  )}
                  {status === "running" && (
                    <RefreshCwIcon className="size-3 shrink-0 animate-spin text-primary" />
                  )}
                  {status === "done" && <CheckIcon className="size-3 shrink-0 text-accent-green" />}
                  {status === "error" && (
                    <XCircleIcon className="size-3 shrink-0 text-destructive" />
                  )}
                  <span className="min-w-0 flex-1 truncate">{repo?.name ?? path}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>{errors[path]}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
