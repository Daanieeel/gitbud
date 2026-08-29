import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";
import { useNetworkStore } from "@/store/useNetworkStore";
import type { PullRequestCommit, PullRequestFile } from "@/lib/types";

const COMMITS_PAGE_SIZE = 100;

/** Commits belonging to a PR, for the Commits tab. Keyed by `headSha`, not polled — a PR's
 * commit list is immutable for a given head commit, exactly like `usePullRequestDetail`'s files.
 * Pages through `useInfiniteQuery` the same way `usePullRequestList` does for the PR list
 * itself — only the first page is seeded from the local SQLite mirror (see
 * `get_cached_pull_request_commits`'s Rust-side doc comment), later pages are live-only. */
export function usePullRequestCommits(
  repoPath: string | null,
  login: string | null,
  number: number | null,
  headSha: string | null,
) {
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: queryKeys.prCommits(repoPath ?? "", login ?? "", number ?? -1, headSha ?? ""),
    queryFn: async ({ pageParam }): Promise<PullRequestCommit[]> => {
      if (!repoPath || !login || number === null || !headSha) {
        throw new Error("usePullRequestCommits: query ran while disabled");
      }
      if (pageParam === 1) {
        try {
          const cached = await api.getCachedPullRequestCommits(repoPath, number);
          if (cached) {
            queryClient.setQueryData(
              queryKeys.prCommits(repoPath, login, number, headSha),
              (old: InfiniteData<PullRequestCommit[], number> | undefined) =>
                old ?? { pages: [cached], pageParams: [1] },
            );
          }
        } catch {
          // Local mirror unavailable, fall through to the live fetch below.
        }
      }
      if (useNetworkStore.getState().shouldSkip()) {
        throw new Error("Skipping GitHub request: already offline.");
      }
      try {
        const commits = await api.githubListPullRequestCommits(
          repoPath,
          login,
          number,
          headSha,
          pageParam,
        );
        useNetworkStore.getState().noteSuccess();
        return commits;
      } catch (err) {
        useNetworkStore.getState().noteError(String(err));
        throw err;
      }
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === COMMITS_PAGE_SIZE ? allPages.length + 1 : undefined,
    enabled: !!repoPath && !!login && number !== null && !!headSha,
  });
  const commits: PullRequestCommit[] = query.data?.pages.flat() ?? [];
  return { ...query, commits };
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
