import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";
import { useNetworkStore } from "@/store/useNetworkStore";
import { isBrokenTokenError, useGitHubStore } from "@/store/useGitHubStore";
import { useRepoStore } from "@/store/useRepoStore";
import type { PRFilter } from "@/store/usePRStore";
import type { BranchInfo, PullRequest, PullRequestFile, ReviewComment } from "@/lib/types";

const PR_PAGE_SIZE = 50;

export function usePullRequestList(repoPath: string | null, login: string | null, filter: PRFilter) {
  const query = useInfiniteQuery({
    queryKey: queryKeys.prList(repoPath ?? "", login ?? "", filter),
    queryFn: async ({ pageParam }) => {
      try {
        const pulls = await api.githubListPullRequests(repoPath as string, login as string, filter, pageParam);
        useNetworkStore.getState().noteSuccess();
        useGitHubStore.getState().setBrokenLogin(null);
        return pulls;
      } catch (err) {
        const message = String(err);
        useNetworkStore.getState().noteError(message);
        if (isBrokenTokenError(message)) useGitHubStore.getState().setBrokenLogin(login as string);
        throw err;
      }
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => (lastPage.length === PR_PAGE_SIZE ? allPages.length + 1 : undefined),
    enabled: !!repoPath && !!login,
    retry: false,
  });
  const pulls: PullRequest[] = query.data?.pages.flat() ?? [];
  return { ...query, pulls };
}

interface PullRequestDetail {
  files: PullRequestFile[];
  comments: ReviewComment[];
}

export function usePullRequestDetail(repoPath: string | null, login: string | null, number: number | null) {
  return useQuery({
    queryKey: queryKeys.prDetail(repoPath ?? "", login ?? "", number ?? -1),
    queryFn: async (): Promise<PullRequestDetail> => {
      const [files, comments] = await Promise.all([
        api.githubListPullRequestFiles(repoPath as string, login as string, number as number),
        api.githubListReviewComments(repoPath as string, login as string, number as number),
      ]);
      return { files, comments };
    },
    enabled: !!repoPath && !!login && number !== null,
  });
}

export function useCreatePullRequest(repoPath: string | null, login: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      title,
      head,
      base,
      body,
      draft,
      labels,
      assignees,
      reviewers,
    }: {
      title: string;
      head: string;
      base: string;
      body: string;
      draft: boolean;
      labels: string[];
      assignees: string[];
      reviewers: string[];
    }) => {
      const pr = await api.githubCreatePullRequest(repoPath as string, login as string, title, head, base, body, draft);
      // Labels/assignees/reviewers can only be attached once the PR (and its number) exists —
      // skip calls with nothing selected rather than sending pointless empty-array requests.
      await Promise.all([
        labels.length > 0 ? api.githubAddLabels(repoPath as string, login as string, pr.number, labels) : Promise.resolve(),
        assignees.length > 0
          ? api.githubAddAssignees(repoPath as string, login as string, pr.number, assignees)
          : Promise.resolve(),
        reviewers.length > 0
          ? api.githubRequestReviewers(repoPath as string, login as string, pr.number, reviewers)
          : Promise.resolve(),
      ]);
      return pr;
    },
    onSuccess: () => {
      if (repoPath && login) void queryClient.invalidateQueries({ queryKey: ["pr-list", repoPath, login] });
    },
  });
}

export function useMergePullRequest(repoPath: string | null, login: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      number,
      method,
      commitTitle,
      commitMessage,
      sha,
      deleteBranch,
      headRef,
      baseRef,
    }: {
      number: number;
      method: string;
      commitTitle: string;
      commitMessage: string;
      sha: string;
      deleteBranch: boolean;
      headRef: string;
      baseRef: string;
    }) => {
      const path = repoPath as string;
      await api.githubMergePullRequest(
        path,
        login as string,
        number,
        method,
        commitTitle.trim() || null,
        commitMessage.trim() || null,
        sha || null,
      );
      if (deleteBranch) {
        try {
          await api.githubDeleteRemoteBranch(path, login as string, headRef);
        } catch (err) {
          toast.error(String(err));
        }
        // Best-effort: the merged branch is very often not even checked out locally. But when it
        // IS the currently checked-out branch, git2 refuses to delete it outright — dodge that by
        // switching to the PR's base branch first (falling back to any other local branch if the
        // base isn't checked out locally either), mirroring useDeleteBranch's fallback logic.
        const cached = queryClient.getQueryData<{ branch: string | null; branches: BranchInfo[] }>(
          queryKeys.branches(path),
        );
        if (cached?.branch === headRef) {
          const fallback =
            cached.branches.find((b) => !b.is_remote && b.name === baseRef) ??
            cached.branches.find((b) => !b.is_remote && b.name !== headRef);
          if (fallback) await api.checkoutBranch(path, fallback.name).catch(() => {});
        }
        await api.deleteBranch(path, headRef).catch(() => {});
        void queryClient.invalidateQueries({ queryKey: queryKeys.branches(path) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.status(path) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.log(path) });
        void useRepoStore.getState().loadRepos();
      }
    },
    onSuccess: () => {
      if (repoPath && login) void queryClient.invalidateQueries({ queryKey: ["pr-list", repoPath, login] });
    },
  });
}

export function useAddReviewComment(repoPath: string | null, login: string | null, number: number | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      commitId,
      path,
      line,
      side,
      body,
    }: {
      commitId: string;
      path: string;
      line: number;
      side: "LEFT" | "RIGHT";
      body: string;
    }) =>
      api.githubCreateReviewComment(repoPath as string, login as string, number as number, commitId, path, line, side, body),
    onSuccess: (comment) => {
      if (!repoPath || !login || number === null) return;
      queryClient.setQueryData<PullRequestDetail | undefined>(
        queryKeys.prDetail(repoPath, login, number),
        (prev) => (prev ? { ...prev, comments: [...prev.comments, comment] } : prev),
      );
    },
  });
}

export { isBrokenTokenError };
