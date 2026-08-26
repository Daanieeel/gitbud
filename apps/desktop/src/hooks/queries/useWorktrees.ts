import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";

export function useWorktrees(repoPath: string | null) {
  return useQuery({
    queryKey: queryKeys.worktrees(repoPath ?? ""),
    queryFn: () => api.listWorktrees(repoPath as string),
    enabled: !!repoPath,
    initialData: [],
  });
}

export function useAddWorktree(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ path, branch, createBranch }: { path: string; branch: string; createBranch: boolean }) =>
      api.addWorktree(repoPath as string, path, branch, createBranch),
    onSuccess: () => {
      if (repoPath) void queryClient.invalidateQueries({ queryKey: queryKeys.worktrees(repoPath) });
    },
  });
}

export function useRemoveWorktree(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ path, force }: { path: string; force: boolean }) =>
      api.removeWorktree(repoPath as string, path, force),
    onSuccess: () => {
      if (repoPath) void queryClient.invalidateQueries({ queryKey: queryKeys.worktrees(repoPath) });
    },
  });
}
