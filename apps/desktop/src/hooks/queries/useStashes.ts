import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";

export function useStashes(repoPath: string | null) {
  return useQuery({
    queryKey: queryKeys.stashes(repoPath ?? ""),
    queryFn: () => api.listStashes(repoPath as string),
    enabled: !!repoPath,
    initialData: [],
  });
}

function useInvalidateStashes(repoPath: string | null) {
  const queryClient = useQueryClient();
  return () => {
    if (!repoPath) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.stashes(repoPath) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.status(repoPath) });
  };
}

export function useStashSave(repoPath: string | null) {
  const invalidate = useInvalidateStashes(repoPath);
  return useMutation({
    mutationFn: ({ message, includeUntracked }: { message: string; includeUntracked: boolean }) =>
      api.stashSave(repoPath as string, message, includeUntracked),
    onSuccess: invalidate,
  });
}

export function useStashApply(repoPath: string | null) {
  const invalidate = useInvalidateStashes(repoPath);
  return useMutation({
    mutationFn: (index: number) => api.stashApply(repoPath as string, index),
    onSuccess: invalidate,
  });
}

export function useStashPop(repoPath: string | null) {
  const invalidate = useInvalidateStashes(repoPath);
  return useMutation({
    mutationFn: (index: number) => api.stashPop(repoPath as string, index),
    onSuccess: invalidate,
  });
}

export function useStashDrop(repoPath: string | null) {
  const invalidate = useInvalidateStashes(repoPath);
  return useMutation({
    mutationFn: (index: number) => api.stashDrop(repoPath as string, index),
    onSuccess: invalidate,
  });
}

export function useStashApplyFile(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ index, path }: { index: number; path: string }) =>
      api.stashApplyFile(repoPath as string, index, path),
    onSuccess: () => {
      if (repoPath) void queryClient.invalidateQueries({ queryKey: queryKeys.status(repoPath) });
    },
  });
}

// The stash detail dialog shows one stash's files/diff — a stash is a commit under the hood, so
// this is a two-step oid lookup followed by the same commit-files/commit-file-diff calls the
// History tab uses.
export function useStashFiles(repoPath: string | null, index: number | null) {
  return useQuery({
    queryKey: queryKeys.stashFiles(repoPath ?? "", index ?? -1),
    queryFn: () => api.getStashOid(repoPath as string, index as number).then((oid) => api.getCommitFiles(repoPath as string, oid)),
    enabled: !!repoPath && index !== null,
  });
}

export function useStashFileDiff(repoPath: string | null, index: number | null, path: string | null) {
  return useQuery({
    queryKey: queryKeys.stashFileDiff(repoPath ?? "", index ?? -1, path ?? ""),
    queryFn: () =>
      api
        .getStashOid(repoPath as string, index as number)
        .then((oid) => api.getCommitFileDiff(repoPath as string, oid, path as string)),
    enabled: !!repoPath && index !== null && !!path,
  });
}
