import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";
import type { CheckRun } from "@/lib/types";

// Check runs settle (queued -> in_progress -> completed) over minutes, so a short staleTime
// is enough to dedupe the CI badge on a PR's list row and its merge dialog mounting/remounting
// close together, without ever going stale enough to show a wrong result for long.
const CHECK_RUNS_STALE_MS = 20_000;
// While a run is still in progress, actively poll it — this is what keeps a CI badge live
// wherever it's actually on screen (a PR list row, PR detail's header, the merge dialog), not
// just on mount. `refetchInterval` only fires for a currently-mounted/observed query, and
// (refetchIntervalInBackground defaults to false) pauses on its own while the window isn't
// visible, so this doesn't need its own visibility gating.
export const CHECK_RUNS_POLL_MS = 15_000;

/** Shared with `refetchInterval` below so the countdown-to-next-refresh UI (see
 * CheckRunsRefresh) shows exactly the interval that's actually in effect, rather than a second,
 * independently-maintained guess at it. `null` means "not auto-polling right now". */
export function checkRunsPollInterval(runs: CheckRun[] | undefined): number | null {
  // No checks reported, or every one of them already finished — nothing left to wait on.
  if (!runs || runs.length === 0 || runs.every((r) => r.status === "completed")) return null;
  return CHECK_RUNS_POLL_MS;
}

export function useCheckRuns(repoPath: string | null, login: string | null, sha: string | null) {
  return useQuery({
    queryKey: queryKeys.checkRuns(repoPath ?? "", login ?? "", sha ?? ""),
    queryFn: () => api.githubListCheckRuns(repoPath as string, login as string, sha as string),
    enabled: !!repoPath && !!login && !!sha,
    staleTime: CHECK_RUNS_STALE_MS,
    refetchInterval: (query) => checkRunsPollInterval(query.state.data) ?? false,
  });
}
