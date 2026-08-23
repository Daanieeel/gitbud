import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";
import { useSettingsStore } from "@/store/useSettingsStore";

// Paths auto-staged at least once per repo — so a file the user deliberately unstages after
// auto-stage picked it up doesn't just get re-staged on the next status refetch. Cleared for a
// path once it drops out of `status.files` (committed/discarded), so a later, genuinely new
// change to that same path is auto-staged again.
const autoStagedPaths = new Map<string, Set<string>>();

async function fetchStatus(repoPath: string) {
  let status = await api.getStatus(repoPath);

  if (useSettingsStore.getState().settings.auto_stage_new_changes) {
    let seen = autoStagedPaths.get(repoPath);
    if (!seen) {
      seen = new Set();
      autoStagedPaths.set(repoPath, seen);
    }
    const currentPaths = new Set(status.files.map((f) => f.path));
    for (const path of seen) {
      if (!currentPaths.has(path)) seen.delete(path);
    }

    const toStage = status.files
      .filter((f) => f.status !== "conflicted" && (!f.staged || f.partially_staged) && !seen.has(f.path))
      .map((f) => f.path);
    if (toStage.length > 0) {
      await api.stagePaths(repoPath, toStage);
      toStage.forEach((path) => seen!.add(path));
      status = await api.getStatus(repoPath);
    }
  }
  return status;
}

export function useStatus(repoPath: string | null) {
  return useQuery({
    queryKey: queryKeys.status(repoPath ?? ""),
    queryFn: () => fetchStatus(repoPath as string),
    enabled: !!repoPath,
  });
}

function useInvalidateStatus(repoPath: string | null) {
  const queryClient = useQueryClient();
  return () => {
    if (repoPath) void queryClient.invalidateQueries({ queryKey: queryKeys.status(repoPath) });
  };
}

export function useToggleStaged(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ paths, staged }: { paths: string[]; staged: boolean }) =>
      staged ? api.stagePaths(repoPath as string, paths) : api.unstagePaths(repoPath as string, paths),
    onSuccess: (_, { paths }) => {
      if (!repoPath) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.status(repoPath) });
      for (const path of paths) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.fileDiff(repoPath, path) });
      }
    },
  });
}

export function useDiscardFile(repoPath: string | null) {
  const invalidate = useInvalidateStatus(repoPath);
  return useMutation({
    mutationFn: (path: string) => api.discardFile(repoPath as string, path),
    onSuccess: invalidate,
  });
}

export function useDiscardFiles(repoPath: string | null) {
  const invalidate = useInvalidateStatus(repoPath);
  return useMutation({
    mutationFn: (paths: string[]) => Promise.all(paths.map((path) => api.discardFile(repoPath as string, path))),
    onSuccess: invalidate,
  });
}

export function useStageHunk(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ path, hunkIndex }: { path: string; hunkIndex: number }) =>
      api.stageHunk(repoPath as string, path, hunkIndex),
    onSuccess: (_, { path }) => {
      if (!repoPath) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.status(repoPath) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.fileDiff(repoPath, path) });
    },
  });
}

export function useUnstageHunk(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ path, hunkIndex }: { path: string; hunkIndex: number }) =>
      api.unstageHunk(repoPath as string, path, hunkIndex),
    onSuccess: (_, { path }) => {
      if (!repoPath) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.status(repoPath) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.fileDiff(repoPath, path) });
    },
  });
}

export function useDiscardHunk(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ path, hunkIndex }: { path: string; hunkIndex: number }) =>
      api.discardHunk(repoPath as string, path, hunkIndex),
    onSuccess: (_, { path }) => {
      if (!repoPath) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.status(repoPath) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.fileDiff(repoPath, path) });
    },
  });
}

export function useResolveConflict(repoPath: string | null) {
  const invalidate = useInvalidateStatus(repoPath);
  return useMutation({
    mutationFn: ({ path, side }: { path: string; side: "ours" | "theirs" }) =>
      api.resolveConflict(repoPath as string, path, side),
    onSuccess: invalidate,
  });
}

export function useResolveConflictWithContent(repoPath: string | null) {
  const invalidate = useInvalidateStatus(repoPath);
  return useMutation({
    mutationFn: ({ path, content }: { path: string; content: string }) =>
      api.resolveConflictWithContent(repoPath as string, path, content),
    onSuccess: invalidate,
  });
}
