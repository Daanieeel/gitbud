import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";

export function useTags(repoPath: string | null, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.tags(repoPath ?? ""),
    queryFn: () => api.listTags(repoPath as string),
    enabled: !!repoPath && enabled,
    initialData: [],
  });
}

export function useCreateTag(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, message }: { name: string; message: string }) =>
      api.createTag(repoPath as string, name, message),
    onSuccess: () => {
      if (repoPath) void queryClient.invalidateQueries({ queryKey: queryKeys.tags(repoPath) });
    },
  });
}

export function useDeleteTag(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.deleteTag(repoPath as string, name),
    onSuccess: () => {
      if (repoPath) void queryClient.invalidateQueries({ queryKey: queryKeys.tags(repoPath) });
    },
  });
}

export function usePushTag(repoPath: string | null) {
  return useMutation({
    mutationFn: (name: string) => api.pushTag(repoPath as string, name),
  });
}
