import { openUrl } from "@tauri-apps/plugin-opener";
import { runIcon, runStatusLabel } from "../CIBadge";
import { CheckRunsRefresh } from "../CheckRunsRefresh";
import { PRMergeReadiness } from "./PRMergeReadiness";
import { useCheckRuns, prPollIntervalMs, useIsPrTabActive } from "@/hooks/queries/useCheckRuns";
import { useBranchProtectionRequirements } from "@/hooks/queries/usePRMergeReadiness";
import type { CheckRun, PullRequest } from "@/lib/types";

interface ChecksTabProps {
  repoPath: string;
  login: string;
  pr: PullRequest;
}

function CheckRunRow({ run }: { run: CheckRun }) {
  return (
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault();
        void openUrl(run.html_url);
      }}
      className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
    >
      {runIcon(run)}
      <span className="min-w-0 flex-1 truncate">{run.name}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{runStatusLabel(run)}</span>
    </a>
  );
}

export function ChecksTab({ repoPath, login, pr }: ChecksTabProps) {
  const isPrTabActive = useIsPrTabActive();
  const {
    data: runs = null,
    refetch,
    isFetching,
    dataUpdatedAt,
  } = useCheckRuns(repoPath, login, pr.head_sha, prPollIntervalMs(pr, isPrTabActive, true));
  const { data: requirements } = useBranchProtectionRequirements(repoPath, login, pr.base_ref);
  const requiredContexts = requirements?.required_contexts ?? [];

  if (runs === null) {
    return (
      <div className="flex h-full items-center justify-center bg-dot-grid text-sm text-muted-foreground">
        Loading checks…
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-dot-grid text-sm text-muted-foreground">
        No checks reported for this commit
      </div>
    );
  }

  const required = runs.filter((r) => requiredContexts.includes(r.name));
  const optional = runs.filter((r) => !requiredContexts.includes(r.name));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-3">
      <PRMergeReadiness repoPath={repoPath} login={login} pr={pr} />
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">Checks</span>
        <CheckRunsRefresh
          dataUpdatedAt={dataUpdatedAt}
          isFetching={isFetching}
          onRefresh={() => void refetch()}
          pollIntervalMs={prPollIntervalMs(pr, isPrTabActive, true)}
        />
      </div>
      {required.length > 0 && (
        <div className="mb-3 flex flex-col gap-0.5">
          <span className="px-2 text-xs font-medium text-muted-foreground">Required</span>
          {required.map((r) => (
            <CheckRunRow key={r.name} run={r} />
          ))}
        </div>
      )}
      {optional.length > 0 && (
        <div className="flex flex-col gap-0.5">
          <span className="px-2 text-xs font-medium text-muted-foreground">
            {required.length > 0 ? "Optional" : "All checks"}
          </span>
          {optional.map((r) => (
            <CheckRunRow key={r.name} run={r} />
          ))}
        </div>
      )}
    </div>
  );
}
