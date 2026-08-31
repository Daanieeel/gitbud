import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";
import { useNetworkStore } from "@/store/useNetworkStore";
import { isBrokenTokenError, useGitHubStore } from "@/store/useGitHubStore";
import type { IssueFilter } from "@/store/useIssueStore";
import type { Issue } from "@/lib/types";

const ISSUE_PAGE_SIZE = 50;

/** Mirrors `usePullRequestList` exactly: seed the first page from the local mirror for an
 * instant paint (no spinner), replaced once the live fetch below resolves. */
export function useIssueList(repoPath: string | null, login: string | null, filter: IssueFilter) {
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: queryKeys.issueList(repoPath ?? "", login ?? "", filter),
    queryFn: async ({ pageParam }) => {
      if (!repoPath || !login) throw new Error("useIssueList: query ran while disabled");
      if (pageParam === 1) {
        try {
          const cached = await api.getCachedIssues(repoPath, filter);
          if (cached.length > 0) {
            queryClient.setQueryData(
              queryKeys.issueList(repoPath, login, filter),
              (old: InfiniteData<Issue[], number> | undefined) =>
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
        const issues = await api.githubListIssues(repoPath, login, filter, pageParam);
        useNetworkStore.getState().noteSuccess();
        useGitHubStore.getState().setBrokenLogin(null);
        return issues;
      } catch (err) {
        const message = String(err);
        useNetworkStore.getState().noteError(message);
        if (isBrokenTokenError(message)) useGitHubStore.getState().setBrokenLogin(login);
        throw err;
      }
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === ISSUE_PAGE_SIZE ? allPages.length + 1 : undefined,
    enabled: !!repoPath && !!login,
    retry: 1,
  });
  const issues: Issue[] = query.data?.pages.flat() ?? [];
  return { ...query, issues };
}

export function useCreateIssue(repoPath: string | null, login: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      title,
      body,
      labels,
      assignees,
      milestone,
    }: {
      title: string;
      body: string;
      labels: string[];
      assignees: string[];
      milestone: number | null;
    }) => {
      if (!repoPath || !login) throw new Error("useCreateIssue: repoPath/login not set");
      return api.githubCreateIssue(repoPath, login, title, body, labels, assignees, milestone);
    },
    onSuccess: () => {
      if (repoPath && login)
        void queryClient.invalidateQueries({ queryKey: ["issue-list", repoPath, login] });
    },
  });
}
