import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";

export function useStashes(repoPath: string | null) {
  return useQuery({
    queryKey: queryKeys.stashes(repoPath ?? ""),
    queryFn: () => {
      if (!repoPath) throw new Error("no repo selected");
      return api.listStashes(repoPath);
    },
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
    mutationFn: ({ message, includeUntracked }: { message: string; includeUntracked: boolean }) => {
      if (!repoPath) throw new Error("no repo selected");
      return api.stashSave(repoPath, message, includeUntracked);
    },
    onSuccess: invalidate,
  });
}

export function useStashApply(repoPath: string | null) {
  const invalidate = useInvalidateStashes(repoPath);
  return useMutation({
    mutationFn: (index: number) => {
      if (!repoPath) throw new Error("no repo selected");
      return api.stashApply(repoPath, index);
    },
    onSuccess: invalidate,
  });
}

export function useStashPop(repoPath: string | null) {
  const invalidate = useInvalidateStashes(repoPath);
  return useMutation({
    mutationFn: (index: number) => {
      if (!repoPath) throw new Error("no repo selected");
      return api.stashPop(repoPath, index);
    },
    onSuccess: invalidate,
  });
}

export function useStashDrop(repoPath: string | null) {
  const invalidate = useInvalidateStashes(repoPath);
  return useMutation({
    mutationFn: (index: number) => {
      if (!repoPath) throw new Error("no repo selected");
      return api.stashDrop(repoPath, index);
    },
    onSuccess: invalidate,
  });
}

export function useStashApplyFile(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ index, path }: { index: number; path: string }) => {
      if (!repoPath) throw new Error("no repo selected");
      return api.stashApplyFile(repoPath, index, path);
    },
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
    queryFn: () => {
      if (!repoPath || index === null) throw new Error("no repo/stash selected");
      return api.getStashOid(repoPath, index).then((oid) => api.getCommitFiles(repoPath, oid));
    },
    enabled: !!repoPath && index !== null,
  });
}

export function useStashFileDiff(
  repoPath: string | null,
  index: number | null,
  path: string | null,
) {
  return useQuery({
    queryKey: queryKeys.stashFileDiff(repoPath ?? "", index ?? -1, path ?? ""),
    queryFn: () => {
      if (!repoPath || index === null || !path) throw new Error("no repo/stash/path selected");
      return api
        .getStashOid(repoPath, index)
        .then((oid) => api.getCommitFileDiff(repoPath, oid, path));
    },
    enabled: !!repoPath && index !== null && !!path,
  });
}
