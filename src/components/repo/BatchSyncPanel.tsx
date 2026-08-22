import { CheckIcon, CircleIcon, RefreshCwIcon, XCircleIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBatchSyncStore } from "@/store/useBatchSyncStore";
import { useRepoStore } from "@/store/useRepoStore";
import { cn } from "@/lib/utils";
import type { RepoEntry } from "@/lib/types";

export function BatchSyncTrigger({ repos }: { repos: RepoEntry[] }) {
  const running = useBatchSyncStore((s) => s.running);
  const runPullAll = useBatchSyncStore((s) => s.runPullAll);

  if (repos.length === 0) return null;

  return (
    <Button
      variant="outline"
      size="sm"
      className="w-full"
      disabled={running}
      title="Pull every repo in the sidebar"
      onClick={() => void runPullAll(repos.map((r) => r.path))}
    >
      <RefreshCwIcon className={cn("size-3.5", running && "animate-spin")} />
      Update All ({repos.length})
    </Button>
  );
}

export function BatchSyncStatus() {
  const repos = useRepoStore((s) => s.repos);
  const running = useBatchSyncStore((s) => s.running);
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
          Update All — {running ? "running…" : "done"}
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
