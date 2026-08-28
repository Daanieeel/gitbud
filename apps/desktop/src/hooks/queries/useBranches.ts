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
      if (!repoPath) throw new Error("useBranches: query ran while disabled");
      const [branch, branches] = await Promise.all([
        api.getCurrentBranch(repoPath),
        api.listBranches(repoPath),
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
    mutationFn: (branch: string) => {
      if (!repoPath) throw new Error("useCheckoutBranch: no repo selected");
      return api.checkoutBranch(repoPath, branch);
    },
    onSuccess: invalidate,
  });
}

export function useCreateBranch(repoPath: string | null) {
  const invalidate = useInvalidateAfterBranchChange(repoPath);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, checkout }: { name: string; checkout: boolean }) => {
      if (!repoPath) throw new Error("useCreateBranch: no repo selected");
      return api.createBranch(repoPath, name, checkout);
    },
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
      if (!repoPath) throw new Error("useDeleteBranch: no repo selected");
      const path = repoPath;
      const current = queryClient.getQueryData<{ branch: string; branches: BranchInfo[] }>(
        queryKeys.branches(path),
      );
      // Normalize name if a full remote ref name (e.g. origin/foo) was passed
      const isRemoteRef = current?.branches.some((b) => b.is_remote && b.name === name);
      const branchName = isRemoteRef ? name.replace(/^[^/]+\//, "") : name;

      const isLocal = current
        ? current.branches.some((b) => !b.is_remote && b.name === branchName)
        : await api
            .listBranches(path)
            .then((list) => list.some((b) => !b.is_remote && b.name === branchName))
            .catch(() => false);

      // Deleting the checked-out branch: git refuses outright, so move off it first. Callers are
      // expected to have already confirmed there's somewhere else to go (disabling delete
      // entirely when this is the only local branch).
      if (current?.branch === branchName) {
        const fallback =
          current.branches.find(
            (b) =>
              !b.is_remote && b.name !== branchName && (b.name === "main" || b.name === "master"),
          ) ?? current.branches.find((b) => !b.is_remote && b.name !== branchName);
        if (!fallback) return;
        await api.checkoutBranch(path, fallback.name);
      }
      if (isLocal) {
        await api.deleteBranch(path, branchName);
      }
      if (opts?.deleteRemote) {
        if (isLocal) {
          toast.success(`Deleted ${branchName} locally`);
        }
        await runGitSync(path, () => api.deleteBranchRemote(path, branchName), {
          description: `Deleting ${branchName} on origin…`,
          doneMessage: `Deleted ${branchName} on origin`,
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
      if (!repoPath) throw new Error("useRenameBranch: no repo selected");
      const path = repoPath;
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
        if (repoPath)
          void queryClient.invalidateQueries({ queryKey: queryKeys.aheadBehind(repoPath) });
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
    mutationFn: (branchName: string): Promise<CherryPickResult> => {
      if (!repoPath) throw new Error("useMergeBranch: no repo selected");
      return api.mergeBranch(repoPath, branchName);
    },
    onSuccess: invalidate,
  });
}
