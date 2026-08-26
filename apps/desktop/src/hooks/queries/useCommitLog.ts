import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";
import type { CherryPickResult, CommitEntry, RebaseTodoItem } from "@/lib/types";

const LOG_PAGE_SIZE = 100;

export function useCommitLog(repoPath: string | null) {
  const query = useInfiniteQuery({
    queryKey: queryKeys.log(repoPath ?? ""),
    queryFn: ({ pageParam }) => api.getLog(repoPath as string, LOG_PAGE_SIZE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < LOG_PAGE_SIZE ? undefined : allPages.flat().length,
    enabled: !!repoPath,
  });
  const commits: CommitEntry[] = query.data?.pages.flat() ?? [];
  return { ...query, commits };
}

function useInvalidateAfterHistoryChange(repoPath: string | null) {
  const queryClient = useQueryClient();
  return () => {
    if (!repoPath) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.status(repoPath) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.log(repoPath) });
  };
}

export function useCherryPick(repoPath: string | null) {
  const invalidate = useInvalidateAfterHistoryChange(repoPath);
  return useMutation({
    mutationFn: (oid: string): Promise<CherryPickResult> => api.cherryPick(repoPath as string, oid),
    onSuccess: invalidate,
  });
}

export function useRevertCommit(repoPath: string | null) {
  const invalidate = useInvalidateAfterHistoryChange(repoPath);
  return useMutation({
    mutationFn: (oid: string): Promise<CherryPickResult> => api.revertCommit(repoPath as string, oid),
    onSuccess: invalidate,
  });
}

export function useCreateFixupCommit(repoPath: string | null) {
  const invalidate = useInvalidateAfterHistoryChange(repoPath);
  return useMutation({
    mutationFn: (targetOid: string) => api.createFixupCommit(repoPath as string, targetOid),
    onSuccess: invalidate,
  });
}

export function useInteractiveRebase(repoPath: string | null) {
  const invalidate = useInvalidateAfterHistoryChange(repoPath);
  return useMutation({
    mutationFn: ({ baseOid, todo }: { baseOid: string; todo: RebaseTodoItem[] }) =>
      api.interactiveRebase(repoPath as string, baseOid, todo),
    onSuccess: (result) => {
      if (result.success) invalidate();
    },
  });
}
