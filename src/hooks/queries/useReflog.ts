import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";

export function useReflogEntries(repoPath: string | null, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.reflog(repoPath ?? ""),
    queryFn: () => api.getReflog(repoPath as string),
    enabled: !!repoPath && enabled,
    initialData: [],
  });
}

export function useReflogRestore(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (oid: string) => api.reflogRestore(repoPath as string, oid),
    onSuccess: () => {
      if (!repoPath) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.status(repoPath) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.branches(repoPath) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.log(repoPath) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.aheadBehind(repoPath) });
    },
  });
}
