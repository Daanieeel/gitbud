import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";
import { useNetworkStore } from "@/store/useNetworkStore";
import { isBrokenTokenError, useGitHubStore } from "@/store/useGitHubStore";
import { useRepoStore } from "@/store/useRepoStore";
import type { PRFilter } from "@/store/usePRStore";
import type { BranchInfo, PullRequest, PullRequestFile, ReviewComment } from "@/lib/types";

const PR_PAGE_SIZE = 50;

export function usePullRequestList(
  repoPath: string | null,
  login: string | null,
  filter: PRFilter,
) {
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: queryKeys.prList(repoPath ?? "", login ?? "", filter),
    queryFn: async ({ pageParam }) => {
      if (!repoPath || !login) throw new Error("usePullRequestList: query ran while disabled");
      // Seed the first page from the local mirror for an instant paint (no spinner) while the
      // live fetch below is still in flight, replaced once that resolves. A failure reading the
      // mirror must never block attempting the live fetch below (e.g. this is what shows PRs at
      // all while offline, for a repo/PR that WAS viewed online before).
      if (pageParam === 1) {
        try {
          const cached = await api.getCachedPullRequests(repoPath, filter);
          if (cached.length > 0) {
            queryClient.setQueryData(
              queryKeys.prList(repoPath, login, filter),
              (old: InfiniteData<PullRequest[], number> | undefined) =>
                old ?? { pages: [cached], pageParams: [1] },
            );
          }
        } catch {
          // Local mirror unavailable, fall through to the live fetch below.
        }
      }
      // Centralized offline flag (useNetworkStore) — skip straight to the error path instead of
      // re-firing a network call that's just going to hang out to its connect timeout again. The
      // `online` browser event (see App.tsx), refetchOnReconnect, and `shouldSkip`'s own periodic
      // retry probe are what clear `offline` and let calls back through.
      if (useNetworkStore.getState().shouldSkip()) {
        throw new Error("Skipping GitHub request: already offline.");
      }
      try {
        const pulls = await api.githubListPullRequests(repoPath, login, filter, pageParam);
        useNetworkStore.getState().noteSuccess();
        useGitHubStore.getState().setBrokenLogin(null);
        return pulls;
      } catch (err) {
        const message = String(err);
        useNetworkStore.getState().noteError(message);
        if (isBrokenTokenError(message)) useGitHubStore.getState().setBrokenLogin(login);
        throw err;
      }
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === PR_PAGE_SIZE ? allPages.length + 1 : undefined,
    enabled: !!repoPath && !!login,
    // Not `false`: right as connectivity comes back (e.g. the `online` event firing before DNS
    // is actually usable again), the first refetch attempt can still fail — one retry with the
    // library's default backoff lets that self-heal instead of leaving a stale error on screen
    // until the user manually switches tabs/repos.
    retry: 1,
  });
  const pulls: PullRequest[] = query.data?.pages.flat() ?? [];
  return { ...query, pulls };
}

interface PullRequestDetail {
  files: PullRequestFile[];
  comments: ReviewComment[];
}

export function usePullRequestDetail(
  repoPath: string | null,
  login: string | null,
  number: number | null,
  headSha: string | null,
) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.prDetail(repoPath ?? "", login ?? "", number ?? -1),
    queryFn: async (): Promise<PullRequestDetail> => {
      if (!repoPath || !login || number === null)
        throw new Error("usePullRequestDetail: query ran while disabled");
      // Seed from the local mirror for an instant paint (whatever's cached, even if stale) while
      // the live fetch below (which itself skips re-fetching/re-parsing files when `headSha`
      // still matches what's cached) is in flight. A failure reading the mirror must never
      // block attempting the live fetch below (e.g. this is what shows a PR's files at all while
      // offline, for one that WAS viewed online before).
      try {
        const cached = await api.getCachedPullRequestDetail(repoPath, number);
        if (cached) {
          queryClient.setQueryData(
            queryKeys.prDetail(repoPath, login, number),
            (old: PullRequestDetail | undefined) => old ?? cached,
          );
        }
      } catch {
        // Local mirror unavailable, fall through to the live fetch below.
      }
      // Same centralized offline check as usePullRequestList (useNetworkStore) — skip straight
      // to the error path instead of re-firing network calls that are just going to hang out to
      // their connect timeout again.
      if (useNetworkStore.getState().shouldSkip()) {
        throw new Error("Skipping GitHub request: already offline.");
      }
      try {
        const [files, comments] = await Promise.all([
          api.githubListPullRequestFiles(repoPath, login, number, headSha ?? ""),
          api.githubListReviewComments(repoPath, login, number),
        ]);
        useNetworkStore.getState().noteSuccess();
        return { files, comments };
      } catch (err) {
        useNetworkStore.getState().noteError(String(err));
        throw err;
      }
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
      if (!repoPath || !login) throw new Error("useCreatePullRequest: repoPath/login not set");
      const pr = await api.githubCreatePullRequest(repoPath, login, title, head, base, body, draft);
      // Labels/assignees/reviewers can only be attached once the PR (and its number) exists —
      // skip calls with nothing selected rather than sending pointless empty-array requests.
      await Promise.all([
        labels.length > 0
          ? api.githubAddLabels(repoPath, login, pr.number, labels)
          : Promise.resolve(),
        assignees.length > 0
          ? api.githubAddAssignees(repoPath, login, pr.number, assignees)
          : Promise.resolve(),
        reviewers.length > 0
          ? api.githubRequestReviewers(repoPath, login, pr.number, reviewers)
          : Promise.resolve(),
      ]);
      return pr;
    },
    onSuccess: () => {
      if (repoPath && login)
        void queryClient.invalidateQueries({ queryKey: ["pr-list", repoPath, login] });
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
      if (!repoPath || !login) throw new Error("useMergePullRequest: repoPath/login not set");
      await api.githubMergePullRequest(
        repoPath,
        login,
        number,
        method,
        commitTitle.trim() || null,
        commitMessage.trim() || null,
        sha || null,
      );
      if (deleteBranch) {
        try {
          await api.githubDeleteRemoteBranch(repoPath, login, headRef);
        } catch (err) {
          toast.error(String(err));
        }
        // Best-effort: the merged branch is very often not even checked out locally. But when it
        // IS the currently checked-out branch, git2 refuses to delete it outright — dodge that by
        // switching to the PR's base branch first (falling back to any other local branch if the
        // base isn't checked out locally either), mirroring useDeleteBranch's fallback logic.
        const cached = queryClient.getQueryData<{ branch: string | null; branches: BranchInfo[] }>(
          queryKeys.branches(repoPath),
        );
        if (cached?.branch === headRef) {
          const fallback =
            cached.branches.find((b) => !b.is_remote && b.name === baseRef) ??
            cached.branches.find((b) => !b.is_remote && b.name !== headRef);
          if (fallback) {
            await api.checkoutBranch(repoPath, fallback.name).catch(() => {});
            // Landing on the fallback branch after a merge is exactly when it's most likely to
            // be behind origin (the merge that was just performed happened on GitHub, not
            // locally) — fetch (not pull, nothing to reconcile locally) so ahead/behind counts
            // and the branch list reflect it right away.
            await api.gitFetch(repoPath).catch(() => {});
          }
        }
        await api.deleteBranch(repoPath, headRef).catch(() => {});
        void queryClient.invalidateQueries({ queryKey: queryKeys.branches(repoPath) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.status(repoPath) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.log(repoPath) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.aheadBehind(repoPath) });
        void useRepoStore.getState().loadRepos();
      }
    },
    onSuccess: () => {
      if (repoPath && login)
        void queryClient.invalidateQueries({ queryKey: ["pr-list", repoPath, login] });
    },
  });
}

export function useAddReviewComment(
  repoPath: string | null,
  login: string | null,
  number: number | null,
) {
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
    }) => {
      if (!repoPath || !login || number === null)
        throw new Error("useAddReviewComment: repoPath/login/number not set");
      return api.githubCreateReviewComment(
        repoPath,
        login,
        number,
        commitId,
        path,
        line,
        side,
        body,
      );
    },
    onSuccess: (comment) => {
      if (!repoPath || !login || number === null) return;
      queryClient.setQueryData<PullRequestDetail | undefined>(
        queryKeys.prDetail(repoPath, login, number),
        (prev) => (prev ? { ...prev, comments: [...prev.comments, comment] } : prev),
      );
    },
  });
}

export function useReplyToReviewComment(
  repoPath: string | null,
  login: string | null,
  number: number | null,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ inReplyTo, body }: { inReplyTo: number; body: string }) => {
      if (!repoPath || !login || number === null)
        throw new Error("useReplyToReviewComment: repoPath/login/number not set");
      return api.githubReplyToReviewComment(repoPath, login, number, inReplyTo, body);
    },
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
