import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";
import type { Workspace } from "@/lib/types";

export function useWorkspaces() {
  return useQuery({
    queryKey: queryKeys.workspaces,
    queryFn: () => api.listWorkspaces(),
    staleTime: 60_000,
    initialData: [] as Workspace[],
  });
}

export function useCreateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, repoPaths }: { name: string; repoPaths: string[] }) =>
      api.createWorkspace(name, repoPaths),
    onSuccess: (workspaces) => queryClient.setQueryData(queryKeys.workspaces, workspaces),
  });
}

export function useUpdateWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name, repoPaths }: { id: string; name: string; repoPaths: string[] }) =>
      api.updateWorkspace(id, name, repoPaths),
    onSuccess: (workspaces) => queryClient.setQueryData(queryKeys.workspaces, workspaces),
  });
}

export function useDeleteWorkspace() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteWorkspace(id),
    onSuccess: (workspaces) => queryClient.setQueryData(queryKeys.workspaces, workspaces),
  });
}
