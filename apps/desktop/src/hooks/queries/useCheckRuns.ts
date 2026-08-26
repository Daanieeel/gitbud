import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";
import { useNetworkStore } from "@/store/useNetworkStore";
import { useRepoStore } from "@/store/useRepoStore";
import type { CheckRun, PullRequest } from "@/lib/types";

// Check runs settle (queued -> in_progress -> completed) over minutes, so a short staleTime
// is enough to dedupe the CI badge on a PR's list row and its merge dialog mounting/remounting
// close together, without ever going stale enough to show a wrong result for long.
const CHECK_RUNS_STALE_MS = 20_000;

export const SELECTED_PR_POLL_MS = 10_000;
export const BACKGROUND_PR_POLL_MS = 60_000;

/** Whether the Pull Requests tab is the active tab — CI polling only ever runs there; switching
 * to Changes/History stops it. */
export function useIsPrTabActive(): boolean {
  return useRepoStore((s) => s.activeTab === "pulls");
}

/** Flat, two-rate polling — no staggered/decaying schedule: 10s for the PR currently open in
 * PRDetail or the merge dialog, 60s for every other open PR sitting in the background of the
 * list. `null` means don't poll at all — the PR tab isn't active, or the PR isn't open (a
 * merged/closed PR's checks are done; nothing left to watch). */
export function prPollIntervalMs(
  pr: Pick<PullRequest, "state" | "merged">,
  isPrTabActive: boolean,
  isSelected: boolean,
): number | null {
  if (!isPrTabActive || pr.state !== "open" || pr.merged) return null;
  return isSelected ? SELECTED_PR_POLL_MS : BACKGROUND_PR_POLL_MS;
}

export function useCheckRuns(
  repoPath: string | null,
  login: string | null,
  sha: string | null,
  pollIntervalMs: number | null,
) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.checkRuns(repoPath ?? "", login ?? "", sha ?? ""),
    queryFn: async () => {
      if (repoPath && sha) {
        try {
          const cached = await api.getCachedCheckRuns(repoPath, sha);
          if (cached) {
            queryClient.setQueryData<CheckRun[]>(
              queryKeys.checkRuns(repoPath, login ?? "", sha),
              (old) => old ?? cached,
            );
          }
        } catch {
          // Local mirror unavailable, fall through to the live fetch below.
        }
      }
      // Same centralized offline check as usePullRequestList (useNetworkStore) — skip straight
      // to the error path instead of re-firing a network call that's just going to hang out to
      // its connect timeout again, especially since this can poll every 10-60s.
      if (useNetworkStore.getState().offline) {
        throw new Error("Skipping GitHub request: already offline.");
      }
      if (!repoPath || !login || !sha) throw new Error("no repo/login/commit selected");
      try {
        const runs = await api.githubListCheckRuns(repoPath, login, sha);
        useNetworkStore.getState().noteSuccess();
        return runs;
      } catch (err) {
        useNetworkStore.getState().noteError(String(err));
        throw err;
      }
    },
    enabled: !!repoPath && !!login && !!sha,
    staleTime: CHECK_RUNS_STALE_MS,
    refetchInterval: pollIntervalMs ?? false,
  });
}
