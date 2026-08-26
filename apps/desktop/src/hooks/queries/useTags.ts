import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";

export function useTags(repoPath: string | null, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.tags(repoPath ?? ""),
    queryFn: () => {
      if (!repoPath) throw new Error("no repo selected");
      return api.listTags(repoPath);
    },
    enabled: !!repoPath && enabled,
    initialData: [],
  });
}

export function useCreateTag(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, message }: { name: string; message: string }) => {
      if (!repoPath) throw new Error("no repo selected");
      return api.createTag(repoPath, name, message);
    },
    onSuccess: () => {
      if (repoPath) void queryClient.invalidateQueries({ queryKey: queryKeys.tags(repoPath) });
    },
  });
}

export function useDeleteTag(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => {
      if (!repoPath) throw new Error("no repo selected");
      return api.deleteTag(repoPath, name);
    },
    onSuccess: () => {
      if (repoPath) void queryClient.invalidateQueries({ queryKey: queryKeys.tags(repoPath) });
    },
  });
}

export function usePushTag(repoPath: string | null) {
  return useMutation({
    mutationFn: (name: string) => {
      if (!repoPath) throw new Error("no repo selected");
      return api.pushTag(repoPath, name);
    },
  });
}
