import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";

function useInvalidateAfterCommit(repoPath: string | null) {
  const queryClient = useQueryClient();
  return () => {
    if (!repoPath) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.status(repoPath) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.log(repoPath) });
  };
}

export function useCommit(repoPath: string | null) {
  const invalidate = useInvalidateAfterCommit(repoPath);
  return useMutation({
    mutationFn: ({ summary, description }: { summary: string; description: string }) => {
      if (!repoPath) throw new Error("no repo selected");
      return api.commit(repoPath, summary, description);
    },
    onSuccess: invalidate,
  });
}

export function useAmendCommit(repoPath: string | null) {
  const invalidate = useInvalidateAfterCommit(repoPath);
  return useMutation({
    mutationFn: ({ summary, description }: { summary: string; description: string }) => {
      if (!repoPath) throw new Error("no repo selected");
      return api.amendCommit(repoPath, summary, description);
    },
    onSuccess: invalidate,
  });
}

export function useUndoLastCommit(repoPath: string | null) {
  const invalidate = useInvalidateAfterCommit(repoPath);
  return useMutation({
    mutationFn: () => {
      if (!repoPath) throw new Error("no repo selected");
      return api.undoLastCommit(repoPath);
    },
    onSuccess: invalidate,
  });
}
