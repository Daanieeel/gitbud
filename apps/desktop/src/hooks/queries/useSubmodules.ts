import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";

export function useSubmodules(repoPath: string | null) {
  return useQuery({
    queryKey: queryKeys.submodules(repoPath ?? ""),
    queryFn: () => api.listSubmodules(repoPath as string),
    enabled: !!repoPath,
    initialData: [],
  });
}

export function useUpdateSubmodule(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (submodulePath: string) => api.updateSubmodule(repoPath as string, submodulePath),
    onSuccess: () => {
      if (repoPath) void queryClient.invalidateQueries({ queryKey: queryKeys.submodules(repoPath) });
    },
  });
}

export function useUpdateAllSubmodules(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.updateAllSubmodules(repoPath as string),
    onSuccess: () => {
      if (repoPath) void queryClient.invalidateQueries({ queryKey: queryKeys.submodules(repoPath) });
    },
  });
}
