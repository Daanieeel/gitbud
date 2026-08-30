import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";
import { useNetworkStore } from "@/store/useNetworkStore";
import type { Issue } from "@/lib/types";

/** The single-issue fetch behind the header/sidebar/conversation — mirrors
 * `usePullRequestMeta`. `initialData` seeds instantly from the list-sourced `issue` object (no
 * spinner), then the live fetch here keeps it fresh (labels/assignees/milestone can change while
 * viewing). */
export function useIssueMeta(
  repoPath: string | null,
  login: string | null,
  issue: Issue | null,
  pollIntervalMs: number | null,
) {
  const number = issue?.number ?? null;
  return useQuery({
    queryKey: queryKeys.issueMeta(repoPath ?? "", login ?? "", number ?? -1),
    queryFn: async () => {
      if (!repoPath || !login || number === null) {
        throw new Error("useIssueMeta: query ran while disabled");
      }
      if (useNetworkStore.getState().shouldSkip()) {
        throw new Error("Skipping GitHub request: already offline.");
      }
      try {
        const meta = await api.githubGetIssue(repoPath, login, number);
        useNetworkStore.getState().noteSuccess();
        return meta;
      } catch (err) {
        useNetworkStore.getState().noteError(String(err));
        throw err;
      }
    },
    enabled: !!repoPath && !!login && number !== null,
    initialData: issue ?? undefined,
    refetchInterval: pollIntervalMs ?? false,
  });
}

export function useUpdateIssueTitle(
  repoPath: string | null,
  login: string | null,
  number: number | null,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (title: string) => {
      if (!repoPath || !login || number === null) {
        throw new Error("useUpdateIssueTitle: repoPath/login/number not set");
      }
      return api.githubUpdateIssueTitle(repoPath, login, number, title);
    },
    onSuccess: (_void, title) => {
      if (!repoPath || !login || number === null) return;
      queryClient.setQueryData<Issue | undefined>(
        queryKeys.issueMeta(repoPath, login, number),
        (prev) => (prev ? { ...prev, title } : prev),
      );
      void queryClient.invalidateQueries({ queryKey: ["issue-list", repoPath, login] });
    },
    onError: (err) => toast.error(String(err)),
  });
}

export function useUpdateIssueBody(
  repoPath: string | null,
  login: string | null,
  number: number | null,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => {
      if (!repoPath || !login || number === null) {
        throw new Error("useUpdateIssueBody: repoPath/login/number not set");
      }
      return api.githubUpdateIssueBody(repoPath, login, number, body);
    },
    onSuccess: (_void, body) => {
      if (!repoPath || !login || number === null) return;
      queryClient.setQueryData<Issue | undefined>(
        queryKeys.issueMeta(repoPath, login, number),
        (prev) => (prev ? { ...prev, body } : prev),
      );
    },
    onError: (err) => toast.error(String(err)),
  });
}

/** Closes an open issue — mirrors `useClosePullRequest`. The list query is invalidated (not
 * optimistically patched) since which `issueList` filter this issue now belongs to depends on
 * that filter's own value. */
export function useCloseIssue(
  repoPath: string | null,
  login: string | null,
  number: number | null,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => {
      if (!repoPath || !login || number === null) {
        throw new Error("useCloseIssue: repoPath/login/number not set");
      }
      return api.githubCloseIssue(repoPath, login, number, null);
    },
    onSuccess: () => {
      if (!repoPath || !login || number === null) return;
      queryClient.setQueryData<Issue | undefined>(
        queryKeys.issueMeta(repoPath, login, number),
        (prev) => (prev ? { ...prev, state: "closed" } : prev),
      );
      void queryClient.invalidateQueries({ queryKey: ["issue-list", repoPath, login] });
    },
    onError: (err) => toast.error(String(err)),
  });
}

/** Reopens a closed issue — the symmetric counterpart to `useCloseIssue`. */
export function useReopenIssue(
  repoPath: string | null,
  login: string | null,
  number: number | null,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => {
      if (!repoPath || !login || number === null) {
        throw new Error("useReopenIssue: repoPath/login/number not set");
      }
      return api.githubReopenIssue(repoPath, login, number);
    },
    onSuccess: () => {
      if (!repoPath || !login || number === null) return;
      queryClient.setQueryData<Issue | undefined>(
        queryKeys.issueMeta(repoPath, login, number),
        (prev) => (prev ? { ...prev, state: "open" } : prev),
      );
      void queryClient.invalidateQueries({ queryKey: ["issue-list", repoPath, login] });
    },
    onError: (err) => toast.error(String(err)),
  });
}

/** Toggles the conversation's locked state — mirrors `useSetConversationLocked`. */
export function useSetIssueConversationLocked(
  repoPath: string | null,
  login: string | null,
  number: number | null,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ locked, lockReason }: { locked: boolean; lockReason: string | null }) => {
      if (!repoPath || !login || number === null) {
        throw new Error("useSetIssueConversationLocked: repoPath/login/number not set");
      }
      return locked
        ? api.githubLockConversation(repoPath, login, number, lockReason)
        : api.githubUnlockConversation(repoPath, login, number);
    },
    onSuccess: (_void, { locked, lockReason }) => {
      if (!repoPath || !login || number === null) return;
      queryClient.setQueryData<Issue | undefined>(
        queryKeys.issueMeta(repoPath, login, number),
        (prev) =>
          prev ? { ...prev, locked, active_lock_reason: locked ? lockReason : null } : prev,
      );
    },
    onError: (err) => toast.error(String(err)),
  });
}
