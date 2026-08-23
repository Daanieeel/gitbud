import { useState } from "react";
import { CheckCircle2Icon, CircleDashedIcon, XCircleIcon } from "lucide-react";
import { useCheckRuns } from "@/hooks/queries/useCheckRuns";
import type { CheckRun } from "@/lib/types";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface CIBadgeProps {
  repoPath: string;
  login: string;
  sha: string;
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

export function CIBadge({ repoPath, login, sha }: CIBadgeProps) {
  const { data: runs = null } = useCheckRuns(repoPath, login, sha);
  const [open, setOpen] = useState(false);

  if (runs === null || runs.length === 0) return null;
  const overall = overallFrom(runs);

  const Icon = overall === "passing" ? CheckCircle2Icon : overall === "failing" ? XCircleIcon : CircleDashedIcon;
  const color =
    overall === "passing" ? "text-accent-green" : overall === "failing" ? "text-accent-pink" : "text-accent-yellow";

  return (
    <Tooltip>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <TooltipTrigger asChild>
            <button onClick={(e) => e.stopPropagation()}>
              <Icon className={`size-3.5 ${color}`} />
            </button>
          </TooltipTrigger>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-1" align="start">
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
      <TooltipContent>{`CI: ${overall}`}</TooltipContent>
    </Tooltip>
  );
}
