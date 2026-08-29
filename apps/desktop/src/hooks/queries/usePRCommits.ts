import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";
import { useNetworkStore } from "@/store/useNetworkStore";
import type { PullRequestCommit, PullRequestFile } from "@/lib/types";

/** Commits belonging to a PR, for the Commits tab. Keyed by `headSha`, not polled — a PR's
 * commit list is immutable for a given head commit, exactly like `usePullRequestDetail`'s files —
 * and follows that same cached-mirror-seed-then-live-fetch shape for the same reason: an instant
 * paint from whatever's cached (even if stale) while the live, freshness-checked fetch is still
 * in flight or unreachable offline. */
export function usePullRequestCommits(
  repoPath: string | null,
  login: string | null,
  number: number | null,
  headSha: string | null,
) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.prCommits(repoPath ?? "", login ?? "", number ?? -1, headSha ?? ""),
    queryFn: async (): Promise<PullRequestCommit[]> => {
      if (!repoPath || !login || number === null || !headSha) {
        throw new Error("usePullRequestCommits: query ran while disabled");
      }
      try {
        const cached = await api.getCachedPullRequestCommits(repoPath, number);
        if (cached) {
          queryClient.setQueryData<PullRequestCommit[] | undefined>(
            queryKeys.prCommits(repoPath, login, number, headSha),
            (old) => old ?? cached,
          );
        }
      } catch {
        // Local mirror unavailable, fall through to the live fetch below.
      }
      if (useNetworkStore.getState().shouldSkip()) {
        throw new Error("Skipping GitHub request: already offline.");
      }
      try {
        const commits = await api.githubListPullRequestCommits(repoPath, login, number, headSha);
        useNetworkStore.getState().noteSuccess();
        return commits;
      } catch (err) {
        useNetworkStore.getState().noteError(String(err));
        throw err;
      }
    },
    enabled: !!repoPath && !!login && number !== null && !!headSha,
  });
}

export function useCommitDiffFiles(
  repoPath: string | null,
  login: string | null,
  sha: string | null,
) {
  return useQuery({
    queryKey: queryKeys.commitDiffFiles(repoPath ?? "", login ?? "", sha ?? ""),
    queryFn: async (): Promise<PullRequestFile[]> => {
      if (!repoPath || !login || !sha) {
        throw new Error("useCommitDiffFiles: query ran while disabled");
      }
      if (useNetworkStore.getState().shouldSkip()) {
        throw new Error("Skipping GitHub request: already offline.");
      }
      try {
        const files = await api.githubGetCommitDiffFiles(repoPath, login, sha);
        useNetworkStore.getState().noteSuccess();
        return files;
      } catch (err) {
        useNetworkStore.getState().noteError(String(err));
        throw err;
      }
    },
    enabled: !!repoPath && !!login && !!sha,
  });
}
