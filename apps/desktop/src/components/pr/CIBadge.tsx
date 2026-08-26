import { useState } from "react";
import { CheckCircle2Icon, CircleDashedIcon, XCircleIcon } from "lucide-react";
import { useCheckRuns } from "@/hooks/queries/useCheckRuns";
import { useNetworkStore } from "@/store/useNetworkStore";
import { CheckRunsRefresh } from "./CheckRunsRefresh";
import type { CheckRun } from "@/lib/types";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@gitbud/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gitbud/ui/tooltip";

interface CIBadgeProps {
  repoPath: string;
  login: string;
  sha: string;
  /** From prPollIntervalMs — null (the default) means don't auto-poll this badge at all, just
   * show whatever's cached and let the manual refresh button do the rest. */
  pollIntervalMs?: number | null;
}

export type Overall = "passing" | "failing" | "pending" | "none";

export function overallFrom(runs: CheckRun[]): Overall {
  if (runs.length === 0) return "none";
  if (runs.some((r) => r.status !== "completed")) return "pending";
  if (runs.some((r) => r.conclusion && !["success", "neutral", "skipped"].includes(r.conclusion))) {
    return "failing";
  }
  return "passing";
}

export function runIcon(run: CheckRun) {
  if (run.status !== "completed") return <CircleDashedIcon className="size-3.5 shrink-0 text-accent-yellow" />;
  if (run.conclusion && ["success", "neutral", "skipped"].includes(run.conclusion)) {
    return <CheckCircle2Icon className="size-3.5 shrink-0 text-accent-green" />;
  }
  return <XCircleIcon className="size-3.5 shrink-0 text-accent-pink" />;
}

// GitHub's raw check-run status/conclusion enum values, mapped to human-readable labels.
const RUN_STATUS_LABEL: Record<string, string> = {
  queued: "Queued",
  in_progress: "In progress",
  waiting: "Waiting",
  requested: "Requested",
  pending: "Pending",
  success: "Success",
  failure: "Failed",
  cancelled: "Cancelled",
  skipped: "Skipped",
  timed_out: "Timed out",
  action_required: "Action required",
  neutral: "Neutral",
  stale: "Stale",
  startup_failure: "Startup failure",
};

export function runStatusLabel(run: CheckRun): string {
  const raw = run.status === "completed" ? (run.conclusion ?? run.status) : run.status;
  return RUN_STATUS_LABEL[raw] ?? raw.replace(/_/g, " ");
}

const OVERALL_ICON: Record<Overall, typeof CheckCircle2Icon> = {
  passing: CheckCircle2Icon,
  failing: XCircleIcon,
  pending: CircleDashedIcon,
  none: CircleDashedIcon,
};

const OVERALL_COLOR: Record<Overall, string> = {
  passing: "text-accent-green",
  failing: "text-accent-pink",
  pending: "text-accent-yellow",
  none: "text-accent-yellow",
};

export function CIBadge({ repoPath, login, sha, pollIntervalMs = null }: CIBadgeProps) {
  const {
    data: runs = null,
    refetch,
    isFetching,
    dataUpdatedAt,
  } = useCheckRuns(repoPath, login, sha, pollIntervalMs);
  const [open, setOpen] = useState(false);
  const offline = useNetworkStore((s) => s.offline);

  if (runs === null || runs.length === 0) return null;
  const overall = overallFrom(runs);

  const Icon = OVERALL_ICON[overall];
  // CI conclusions can flip fast on remote (a rerun, a force-push retriggering checks), so an
  // offline-cached result gets a visibly muted treatment here rather than looking as trustworthy
  // as a fresh one — this is the one place that needs its own local staleness signal, beyond the
  // app's collective offline hints (toolbar icon, PRTab's "You are offline" card).
  const color = offline ? "text-muted-foreground/60" : OVERALL_COLOR[overall];

  return (
    <Tooltip>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <TooltipTrigger asChild>
            <button onClick={(e) => e.stopPropagation()}>
              <Icon className={`size-3.5 ${color} ${offline ? "opacity-60" : ""}`} />
            </button>
          </TooltipTrigger>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-1" align="start">
          <div className="flex items-center justify-between gap-2 px-2 py-1">
            <span className="text-xs font-medium text-muted-foreground">Checks</span>
            <CheckRunsRefresh
              dataUpdatedAt={dataUpdatedAt}
              isFetching={isFetching}
              onRefresh={() => void refetch()}
              pollIntervalMs={pollIntervalMs}
            />
          </div>
          {runs.map((run) => (
            <a
              key={run.name}
              href={run.html_url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
            >
              {runIcon(run)}
              <span className="min-w-0 flex-1 truncate">{run.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{runStatusLabel(run)}</span>
            </a>
          ))}
        </PopoverContent>
      </Popover>
      <TooltipContent>
        {offline ? `CI: ${overall} — cached while offline, may be outdated` : `CI: ${overall}`}
      </TooltipContent>
    </Tooltip>
  );
}
