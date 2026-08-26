import { useIsMutating, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";
import { runGitSync } from "@/lib/gitSync";
import { useRepoStore } from "@/store/useRepoStore";
import { isDivergedPullError, useDivergedPullStore } from "@/store/useDivergedPullStore";

// A button's disabled/spinning state tied directly to an async action can finish and flip back
// off faster than a human eye (or even a browser paint) reliably registers, which reads as "the
// loading state never showed, then flashed on after the fact" once the surrounding UI (label,
// ahead/behind counts, ...) updates a moment later. Holding the mutation "in flight" for at
// least this long guarantees the loading state is actually visible before it clears.
const MIN_SYNCING_MS = 400;

async function guarded(fn: () => Promise<void>) {
  const startedAt = Date.now();
  try {
    await fn();
  } finally {
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_SYNCING_MS)
      await new Promise((resolve) => setTimeout(resolve, MIN_SYNCING_MS - elapsed));
  }
}

// One shared mutation key per repo, tagged onto every fetch/pull/push/sync/LFS mutation below —
// lets any component (the toolbar's SyncButton, a repo row in the sidebar, ...) ask "is a sync
// running for this repo?" via `useIsMutating`, without threading a `syncing` flag through props
// or a store. In practice only one of these ever runs at a time per repo (they all touch the
// same working tree), so one shared key is exactly the right granularity.
function syncMutationKey(repoPath: string) {
  return ["repo-sync", repoPath] as const;
}

/** Whether a fetch/pull/push/sync/LFS mutation is currently running for this repo — shared and
 * reactive across every component that calls it, not just the one that triggered the sync. */
export function useRepoSyncing(repoPath: string | null) {
  return (
    useIsMutating({
      mutationKey: repoPath ? syncMutationKey(repoPath) : ["repo-sync", "__none__"],
    }) > 0
  );
}

/** Fetch/pull/push/sync/LFS actions for a repo. `branch` is only used to word the progress
 * toast — pass `null` from callers that only need `syncing` and never trigger these actions. */
export function useGitSync(repoPath: string | null, branch: string | null) {
  const queryClient = useQueryClient();
  const syncing = useRepoSyncing(repoPath);
  const mutationKey = repoPath ? syncMutationKey(repoPath) : undefined;

  const invalidate = (keys: readonly (readonly (string | number)[])[]) => {
    if (!repoPath) return;
    for (const key of keys) void queryClient.invalidateQueries({ queryKey: key });
  };

  const fetchMutation = useMutation({
    mutationKey,
    mutationFn: () =>
      guarded(async () => {
        if (!repoPath) return;
        await runGitSync(repoPath, () => api.gitFetch(repoPath), {
          description: "Fetching origin…",
          doneMessage: "Fetched origin",
        });
        invalidate([
          queryKeys.branches(repoPath),
          queryKeys.status(repoPath),
          queryKeys.aheadBehind(repoPath),
        ]);
        void useRepoStore.getState().loadRepos();
      }),
  });

  const pullMutation = useMutation({
    mutationKey,
    mutationFn: () =>
      guarded(async () => {
        if (!repoPath) return;
        await runGitSync(repoPath, () => api.gitPull(repoPath), {
          description: `Pulling origin/${branch ?? "current branch"}…`,
          doneMessage: `Pulled origin/${branch ?? "current branch"}`,
          onError: (message) => {
            if (!isDivergedPullError(message)) return false;
            useDivergedPullStore.getState().open(repoPath);
            return true;
          },
        });
        invalidate([
          queryKeys.status(repoPath),
          queryKeys.log(repoPath),
          queryKeys.aheadBehind(repoPath),
        ]);
      }),
  });

  const pushMutation = useMutation({
    mutationKey,
    mutationFn: () =>
      guarded(async () => {
        if (!repoPath) return;
        const aheadBehind = queryClient.getQueryData<{ published: boolean }>(
          queryKeys.aheadBehind(repoPath),
        );
        const publish = aheadBehind ? !aheadBehind.published : false;
        await runGitSync(repoPath, () => api.gitPush(repoPath), {
          description: publish
            ? `Publishing ${branch ?? "current branch"} to origin…`
            : `Pushing ${branch ?? "current branch"} to origin…`,
          doneMessage: publish
            ? `Published ${branch ?? "current branch"} to origin`
            : `Pushed ${branch ?? "current branch"} to origin`,
        });
        invalidate([queryKeys.aheadBehind(repoPath)]);
      }),
  });

  // For a diverged branch (both ahead and behind origin): pull, then push, in one action. If the
  // pull conflicts with a local commit, aborts the merge/rebase immediately (restoring the
  // pre-pull state exactly) and never pushes — a real merge conflict here would mix unreviewed
  // remote history into a commit the user hasn't looked at, so this bails out to a suggested
  // manual recovery instead of dropping them straight into the conflict-resolution UI.
  const syncBranchMutation = useMutation({
    mutationKey,
    mutationFn: () =>
      guarded(async () => {
        if (!repoPath) return;
        await runGitSync(
          repoPath,
          async () => {
            try {
              await api.gitPull(repoPath);
            } catch (err) {
              const status = await api.getStatus(repoPath);
              if (!status.files.some((f) => f.status === "conflicted")) throw err;
              await api.gitAbortPull(repoPath);
              throw (
                "Pulling origin conflicts with your local commit(s) — aborted, nothing changed.\n" +
                "Safer path: undo the last commit, stash the remaining changes, pull from origin, then unstash and recommit."
              );
            }
            await api.gitPush(repoPath);
          },
          {
            description: `Syncing ${branch ?? "current branch"} with origin…`,
            doneMessage: `Synced ${branch ?? "current branch"} with origin`,
            onError: (message) => {
              if (!isDivergedPullError(message)) return false;
              useDivergedPullStore.getState().open(repoPath);
              return true;
            },
          },
        );
        invalidate([
          queryKeys.status(repoPath),
          queryKeys.log(repoPath),
          queryKeys.aheadBehind(repoPath),
        ]);
      }),
  });

  const pullLfsMutation = useMutation({
    mutationKey,
    mutationFn: () =>
      guarded(async () => {
        if (!repoPath) return;
        await runGitSync(repoPath, () => api.gitLfsPull(repoPath), {
          description: "Pulling LFS objects from origin…",
          doneMessage: "Pulled LFS objects from origin",
        });
      }),
  });

  const pushLfsMutation = useMutation({
    mutationKey,
    mutationFn: () =>
      guarded(async () => {
        if (!repoPath || !branch) return;
        await runGitSync(repoPath, () => api.gitLfsPush(repoPath, branch), {
          description: `Pushing LFS objects for ${branch} to origin…`,
          doneMessage: `Pushed LFS objects for ${branch} to origin`,
        });
      }),
  });

  return {
    syncing,
    fetch: () => fetchMutation.mutateAsync(),
    pull: () => pullMutation.mutateAsync(),
    push: () => pushMutation.mutateAsync(),
    syncBranch: () => syncBranchMutation.mutateAsync(),
    pullLfs: () => pullLfsMutation.mutateAsync(),
    pushLfs: () => pushLfsMutation.mutateAsync(),
  };
}

/** Retries a `--ff-only` pull that failed on diverged branches with an explicit strategy the
 * user picked in ResolveDivergedPullDialog, instead of the configured default. */
export function useResolveDivergedPull(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: repoPath ? syncMutationKey(repoPath) : undefined,
    mutationFn: (strategy: "merge" | "rebase") =>
      guarded(async () => {
        if (!repoPath) return;
        await runGitSync(repoPath, () => api.gitPullWithStrategy(repoPath, strategy), {
          description: strategy === "merge" ? "Merging origin…" : "Rebasing onto origin…",
          doneMessage: strategy === "merge" ? "Merged origin" : "Rebased onto origin",
        });
        void queryClient.invalidateQueries({ queryKey: queryKeys.status(repoPath) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.log(repoPath) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.aheadBehind(repoPath) });
      }),
  });
}
