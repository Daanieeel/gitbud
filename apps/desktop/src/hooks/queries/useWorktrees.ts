import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";

export function useWorktrees(repoPath: string | null) {
  return useQuery({
    queryKey: queryKeys.worktrees(repoPath ?? ""),
    queryFn: () => {
      if (!repoPath) throw new Error("no repo selected");
      return api.listWorktrees(repoPath);
    },
    enabled: !!repoPath,
    initialData: [],
  });
}

export function useAddWorktree(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      path,
      branch,
      createBranch,
    }: {
      path: string;
      branch: string;
      createBranch: boolean;
    }) => {
      if (!repoPath) throw new Error("no repo selected");
      return api.addWorktree(repoPath, path, branch, createBranch);
    },
    onSuccess: () => {
      if (repoPath) void queryClient.invalidateQueries({ queryKey: queryKeys.worktrees(repoPath) });
    },
  });
}

export function useRemoveWorktree(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ path, force }: { path: string; force: boolean }) => {
      if (!repoPath) throw new Error("no repo selected");
      return api.removeWorktree(repoPath, path, force);
    },
    onSuccess: () => {
      if (repoPath) void queryClient.invalidateQueries({ queryKey: queryKeys.worktrees(repoPath) });
    },
  });
}
