import { useEffect, useState } from "react";
import { CheckCircle2Icon, CircleDashedIcon, XCircleIcon } from "lucide-react";
import { api } from "@/lib/tauri";
import type { CheckRun } from "@/lib/types";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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

export function CIBadge({ repoPath, login, sha }: CIBadgeProps) {
  const [runs, setRuns] = useState<CheckRun[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void api.githubListCheckRuns(repoPath, login, sha).then(
      (result) => !cancelled && setRuns(result),
      () => !cancelled && setRuns([]),
    );
    return () => {
      cancelled = true;
    };
  }, [repoPath, login, sha]);

  if (runs === null || runs.length === 0) return null;
  const overall = overallFrom(runs);

  const Icon = overall === "passing" ? CheckCircle2Icon : overall === "failing" ? XCircleIcon : CircleDashedIcon;
  const color =
    overall === "passing" ? "text-accent-green" : overall === "failing" ? "text-accent-pink" : "text-accent-yellow";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button onClick={(e) => e.stopPropagation()} title={`CI: ${overall}`}>
          <Icon className={`size-3.5 ${color}`} />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-1" align="start">
        {runs.map((run) => (
          <a
            key={run.name}
            href={run.html_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
          >
            <span className="truncate">{run.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {run.status === "completed" ? run.conclusion : run.status}
            </span>
          </a>
        ))}
      </PopoverContent>
    </Popover>
  );
}
