import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";
import { runGitSync } from "@/lib/gitSync";
import type { BranchInfo, CherryPickResult } from "@/lib/types";

export function useBranches(repoPath: string | null) {
  return useQuery({
    queryKey: queryKeys.branches(repoPath ?? ""),
    queryFn: async () => {
      const [branch, branches] = await Promise.all([
        api.getCurrentBranch(repoPath as string),
        api.listBranches(repoPath as string),
      ]);
      return { branch, branches };
    },
    enabled: !!repoPath,
  });
}

/** Invalidates everything a checkout/merge/rebase/reflog-restore can touch: the branch list and
 * current branch, working-tree status, commit log, and ahead/behind (all branch-relative). */
function useInvalidateAfterBranchChange(repoPath: string | null) {
  const queryClient = useQueryClient();
  return () => {
    if (!repoPath) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.branches(repoPath) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.status(repoPath) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.log(repoPath) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.aheadBehind(repoPath) });
  };
}

export function useCheckoutBranch(repoPath: string | null) {
  const invalidate = useInvalidateAfterBranchChange(repoPath);
  return useMutation({
    mutationFn: (branch: string) => api.checkoutBranch(repoPath as string, branch),
    onSuccess: invalidate,
  });
}

export function useCreateBranch(repoPath: string | null) {
  const invalidate = useInvalidateAfterBranchChange(repoPath);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, checkout }: { name: string; checkout: boolean }) =>
      api.createBranch(repoPath as string, name, checkout),
    onSuccess: (_, { checkout }) => {
      if (checkout) {
        invalidate();
      } else if (repoPath) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.branches(repoPath) });
      }
    },
  });
}

export function useDeleteBranch(repoPath: string | null) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateAfterBranchChange(repoPath);
  return useMutation({
    mutationFn: async ({ name, opts }: { name: string; opts?: { deleteRemote?: boolean } }) => {
      const path = repoPath as string;
      const current = queryClient.getQueryData<{ branch: string; branches: BranchInfo[] }>(
        queryKeys.branches(path),
      );
      // Deleting the checked-out branch: git refuses outright, so move off it first. Callers are
      // expected to have already confirmed there's somewhere else to go (disabling delete
      // entirely when this is the only local branch).
      if (current?.branch === name) {
        const fallback =
          current.branches.find(
            (b) => !b.is_remote && b.name !== name && (b.name === "main" || b.name === "master"),
          ) ?? current.branches.find((b) => !b.is_remote && b.name !== name);
        if (!fallback) return;
        await api.checkoutBranch(path, fallback.name);
      }
      await api.deleteBranch(path, name);
      if (opts?.deleteRemote) {
        toast.success(`Deleted ${name} locally`);
        await runGitSync(path, () => api.deleteBranchRemote(path, name), {
          description: `Deleting ${name} on origin…`,
          doneMessage: `Deleted ${name} on origin`,
        });
      }
    },
    onSuccess: invalidate,
  });
}

export function useRenameBranch(repoPath: string | null) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    if (repoPath) void queryClient.invalidateQueries({ queryKey: queryKeys.branches(repoPath) });
  };
  return useMutation({
    mutationFn: async ({
      oldName,
      newName,
      alsoRenameRemote,
    }: {
      oldName: string;
      newName: string;
      alsoRenameRemote?: boolean;
    }) => {
      const path = repoPath as string;
      try {
        await api.renameBranch(path, oldName, newName);
      } catch (err) {
        toast.error(String(err));
        throw err;
      }
      if (alsoRenameRemote) {
        // The remote step gets its own loading/success/error toast via runGitSync — this one is
        // just for the (near-instant, no-toast-otherwise) local rename that already happened.
        toast.success(`Renamed ${oldName} to ${newName} locally`);
        await runGitSync(path, () => api.renameBranchRemote(path, oldName, newName), {
          description: `Renaming ${oldName} to ${newName} on origin…`,
          doneMessage: `Renamed ${oldName} to ${newName} on origin`,
        });
        // The push (with -u) already made the new name the upstream at the git level — refresh
        // immediately so the "published"/ahead-behind indicators reflect that right away instead
        // of waiting on the fs-watcher's debounce to notice.
        if (repoPath) void queryClient.invalidateQueries({ queryKey: queryKeys.aheadBehind(repoPath) });
      } else {
        toast.success(`Renamed ${oldName} to ${newName}`);
      }
    },
    onSuccess: invalidate,
  });
}

export function useMergeBranch(repoPath: string | null) {
  const invalidate = useInvalidateAfterBranchChange(repoPath);
  return useMutation({
    mutationFn: (branchName: string): Promise<CherryPickResult> => api.mergeBranch(repoPath as string, branchName),
    onSuccess: invalidate,
  });
}

// Fallback used by callers that don't already have a definite CherryPickResult to hand back
// (e.g. no repo selected) — mirrors the old store's default return.
export const EMPTY_CHERRY_PICK_RESULT: CherryPickResult = { conflicted: false, new_oid: null };
