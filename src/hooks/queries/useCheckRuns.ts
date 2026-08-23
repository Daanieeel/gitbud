import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";

// Check runs settle (queued -> in_progress -> completed) over minutes, so a short staleTime
// is enough to dedupe the CI badge on a PR's list row and its merge dialog mounting/remounting
// close together, without ever going stale enough to show a wrong result for long.
const CHECK_RUNS_STALE_MS = 20_000;

export function useCheckRuns(repoPath: string | null, login: string | null, sha: string | null) {
  return useQuery({
    queryKey: queryKeys.checkRuns(repoPath ?? "", login ?? "", sha ?? ""),
    queryFn: () => api.githubListCheckRuns(repoPath as string, login as string, sha as string),
    enabled: !!repoPath && !!login && !!sha,
    staleTime: CHECK_RUNS_STALE_MS,
  });
}
