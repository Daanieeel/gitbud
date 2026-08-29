import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";
import { useNetworkStore } from "@/store/useNetworkStore";
import type { PullRequest } from "@/lib/types";

/** The single-PR fetch behind the header/sidebar/conversation tab — GitHub's list-PRs endpoint
 * never returns `mergeable`/`mergeable_state`/full `requested_reviewers`/`assignees`/`milestone`
 * (only get-a-single-PR computes them), so those stay stale forever if the app only ever reads
 * the list-sourced `pr` object. `initialData` seeds instantly from that list-sourced object (no
 * spinner) — it already went through `usePullRequestList`'s own cached-mirror-seed-then-live-
 * fetch dance, so this doesn't need a second offline-mirror round-trip of its own — then the
 * live fetch here replaces it with the freshly-computed fields once it resolves, polled at the
 * same cadence CI already uses (`prPollIntervalMs`) since reviewers/labels/mergeability are
 * exactly the kind of state a teammate can change mid-review. */
export function usePullRequestMeta(
  repoPath: string | null,
  login: string | null,
  pr: PullRequest | null,
  pollIntervalMs: number | null,
) {
  const number = pr?.number ?? null;
  return useQuery({
    queryKey: queryKeys.prMeta(repoPath ?? "", login ?? "", number ?? -1),
    queryFn: async () => {
      if (!repoPath || !login || number === null) {
        throw new Error("usePullRequestMeta: query ran while disabled");
      }
      if (useNetworkStore.getState().shouldSkip()) {
        throw new Error("Skipping GitHub request: already offline.");
      }
      try {
        const meta = await api.githubGetPullRequest(repoPath, login, number);
        useNetworkStore.getState().noteSuccess();
        return meta;
      } catch (err) {
        useNetworkStore.getState().noteError(String(err));
        throw err;
      }
    },
    enabled: !!repoPath && !!login && number !== null,
    initialData: pr ?? undefined,
    refetchInterval: pollIntervalMs ?? false,
  });
}

/** Retargets the PR onto a different base branch — the sidebar's own base-branch select, using
 * the same underlying endpoint `MergePRDialog`'s retarget-before-merge flow does. */
export function useUpdatePullRequestBase(
  repoPath: string | null,
  login: string | null,
  number: number | null,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (base: string) => {
      if (!repoPath || !login || number === null) {
        throw new Error("useUpdatePullRequestBase: repoPath/login/number not set");
      }
      return api.githubUpdatePullRequestBase(repoPath, login, number, base);
    },
    onSuccess: (_void, base) => {
      if (!repoPath || !login || number === null) return;
      queryClient.setQueryData<PullRequest | undefined>(
        queryKeys.prMeta(repoPath, login, number),
        (prev) => (prev ? { ...prev, base_ref: base } : prev),
      );
    },
    onError: (err) => toast.error(String(err)),
  });
}

export function useUpdatePullRequestBody(
  repoPath: string | null,
  login: string | null,
  number: number | null,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => {
      if (!repoPath || !login || number === null) {
        throw new Error("useUpdatePullRequestBody: repoPath/login/number not set");
      }
      return api.githubUpdatePullRequestBody(repoPath, login, number, body);
    },
    onSuccess: (_void, body) => {
      if (!repoPath || !login || number === null) return;
      queryClient.setQueryData<PullRequest | undefined>(
        queryKeys.prMeta(repoPath, login, number),
        (prev) => (prev ? { ...prev, body } : prev),
      );
    },
    onError: (err) => toast.error(String(err)),
  });
}

/** Toggles the conversation's locked state — `lockReason` is one of GitHub's four
 * (`off-topic`/`too heated`/`resolved`/`spam`) or `null` for "no reason given"; ignored entirely
 * when unlocking. */
export function useSetConversationLocked(
  repoPath: string | null,
  login: string | null,
  number: number | null,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ locked, lockReason }: { locked: boolean; lockReason: string | null }) => {
      if (!repoPath || !login || number === null) {
        throw new Error("useSetConversationLocked: repoPath/login/number not set");
      }
      return locked
        ? api.githubLockConversation(repoPath, login, number, lockReason)
        : api.githubUnlockConversation(repoPath, login, number);
    },
    onSuccess: (_void, { locked, lockReason }) => {
      if (!repoPath || !login || number === null) return;
      queryClient.setQueryData<PullRequest | undefined>(
        queryKeys.prMeta(repoPath, login, number),
        (prev) =>
          prev ? { ...prev, locked, active_lock_reason: locked ? lockReason : null } : prev,
      );
    },
    onError: (err) => toast.error(String(err)),
  });
}
