import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";

export function useSubmodules(repoPath: string | null) {
  return useQuery({
    queryKey: queryKeys.submodules(repoPath ?? ""),
    queryFn: () => {
      if (!repoPath) throw new Error("no repo selected");
      return api.listSubmodules(repoPath);
    },
    enabled: !!repoPath,
    initialData: [],
  });
}

export function useUpdateSubmodule(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (submodulePath: string) => {
      if (!repoPath) throw new Error("no repo selected");
      return api.updateSubmodule(repoPath, submodulePath);
    },
    onSuccess: () => {
      if (repoPath)
        void queryClient.invalidateQueries({ queryKey: queryKeys.submodules(repoPath) });
    },
  });
}

export function useUpdateAllSubmodules(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => {
      if (!repoPath) throw new Error("no repo selected");
      return api.updateAllSubmodules(repoPath);
    },
    onSuccess: () => {
      if (repoPath)
        void queryClient.invalidateQueries({ queryKey: queryKeys.submodules(repoPath) });
    },
  });
}
