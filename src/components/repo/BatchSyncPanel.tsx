import { CheckIcon, ChevronDownIcon, CircleIcon, RefreshCwIcon, XCircleIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useBatchSyncStore } from "@/store/useBatchSyncStore";
import { useRepoStore } from "@/store/useRepoStore";
import { cn } from "@/lib/utils";

export function BatchSyncTrigger() {
  const repos = useRepoStore((s) => s.repos);
  const running = useBatchSyncStore((s) => s.running);
  const runFetchAll = useBatchSyncStore((s) => s.runFetchAll);
  const runPullAll = useBatchSyncStore((s) => s.runPullAll);

  if (repos.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={running}
          title="Run fetch/pull across every repo in the sidebar"
        >
          <RefreshCwIcon className={cn("size-3.5", running && "animate-spin")} />
          Batch
          <ChevronDownIcon className="size-3 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={() => void runFetchAll(repos.map((r) => r.path))}>
          <RefreshCwIcon className="size-3.5" />
          Fetch All ({repos.length})
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void runPullAll(repos.map((r) => r.path))}>
          <RefreshCwIcon className="size-3.5" />
          Pull All ({repos.length})
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function BatchSyncStatus() {
  const repos = useRepoStore((s) => s.repos);
  const running = useBatchSyncStore((s) => s.running);
  const op = useBatchSyncStore((s) => s.op);
  const outcomes = useBatchSyncStore((s) => s.outcomes);
  const errors = useBatchSyncStore((s) => s.errors);
  const dismiss = useBatchSyncStore((s) => s.dismiss);

  const entries = Object.entries(outcomes);
  if (entries.length === 0) return null;

  const doneCount = entries.filter(([, v]) => v === "done").length;
  const errorCount = entries.filter(([, v]) => v === "error").length;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex w-72 flex-col gap-1.5 rounded-md border border-border bg-card p-2 shadow-lg">
      <div className="flex items-center justify-between text-xs font-medium">
        <span>
          {op === "fetch" ? "Fetch All" : "Pull All"} — {running ? "running…" : "done"}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">
            {doneCount}/{entries.length}
            {errorCount > 0 && ` (${errorCount} failed)`}
          </span>
          {!running && (
            <button onClick={dismiss} className="text-muted-foreground hover:text-foreground">
              <XIcon className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="max-h-56 overflow-auto">
        {entries.map(([path, status]) => {
          const repo = repos.find((r) => r.path === path);
          return (
            <div key={path} className="flex items-center gap-2 py-0.5 text-xs" title={errors[path]}>
              {status === "pending" && <CircleIcon className="size-3 shrink-0 text-muted-foreground" />}
              {status === "running" && <RefreshCwIcon className="size-3 shrink-0 animate-spin text-primary" />}
              {status === "done" && <CheckIcon className="size-3 shrink-0 text-accent-green" />}
              {status === "error" && <XCircleIcon className="size-3 shrink-0 text-destructive" />}
              <span className="min-w-0 flex-1 truncate">{repo?.name ?? path}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
