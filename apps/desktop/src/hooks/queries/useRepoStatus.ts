import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";
import { useSettingsStore } from "@/store/useSettingsStore";

// Paths auto-staged at least once per repo, so a file the user deliberately unstages *entirely*
// after auto-stage picked it up doesn't just get re-staged on the next status refetch. Doesn't
// apply to a partially-staged file (see the `partially_staged` check below), since that always
// means new changes exist on top of whatever's staged. Cleared for a path once it drops out of
// `status.files` (committed/discarded), so a later, genuinely new change to that same path is
// auto-staged again.
const autoStagedPaths = new Map<string, Set<string>>();

/** Drops a removed repo's auto-stage bookkeeping so it doesn't linger for the rest of the
 * app session. */
export function clearAutoStagedPaths(repoPath: string) {
  autoStagedPaths.delete(repoPath);
}

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

    // `seen` only suppresses re-staging a path that's back to *fully* unstaged (the user
    // deliberately unstaged it). A `partially_staged` file always has new changes on top of
    // whatever's already staged (by definition not what the user backed out of), so those
    // must be staged regardless of `seen`, or edits made to an already-staged file would never
    // get picked up.
    const toStage = status.files
      .filter(
        (f) =>
          f.status !== "conflicted" && (f.partially_staged || (!f.staged && !seen.has(f.path))),
      )
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
    queryFn: () => {
      if (!repoPath) throw new Error("no repo selected");
      return fetchStatus(repoPath);
    },
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
    mutationFn: ({ paths, staged }: { paths: string[]; staged: boolean }) => {
      if (!repoPath) throw new Error("no repo selected");
      return staged ? api.stagePaths(repoPath, paths) : api.unstagePaths(repoPath, paths);
    },
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
    mutationFn: (path: string) => {
      if (!repoPath) throw new Error("no repo selected");
      return api.discardFile(repoPath, path);
    },
    onSuccess: invalidate,
  });
}

export function useDiscardFiles(repoPath: string | null) {
  const invalidate = useInvalidateStatus(repoPath);
  return useMutation({
    mutationFn: (paths: string[]) => {
      if (!repoPath) throw new Error("no repo selected");
      return Promise.all(paths.map((path) => api.discardFile(repoPath, path)));
    },
    onSuccess: invalidate,
  });
}

export function useAddToGitignore(repoPath: string | null) {
  const invalidate = useInvalidateStatus(repoPath);
  return useMutation({
    mutationFn: (paths: string[]) => {
      if (!repoPath) throw new Error("no repo selected");
      return api.addToGitignore(repoPath, paths);
    },
    onSuccess: invalidate,
  });
}

export function useIgnoreFolder(repoPath: string | null) {
  const invalidate = useInvalidateStatus(repoPath);
  return useMutation({
    mutationFn: (folderPath: string) => {
      if (!repoPath) throw new Error("no repo selected");
      return api.ignoreFolder(repoPath, folderPath);
    },
    onSuccess: invalidate,
  });
}

export function useIgnoreExtension(repoPath: string | null) {
  const invalidate = useInvalidateStatus(repoPath);
  return useMutation({
    mutationFn: (extension: string) => {
      if (!repoPath) throw new Error("no repo selected");
      return api.ignoreExtension(repoPath, extension);
    },
    onSuccess: invalidate,
  });
}

export function useStageHunk(repoPath: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      path,
      hunkIndex,
      lineIndices,
    }: {
      path: string;
      hunkIndex: number;
      lineIndices?: number[];
    }) => {
      if (!repoPath) throw new Error("no repo selected");
      return lineIndices
        ? api.stageHunkLines(repoPath, path, hunkIndex, lineIndices)
        : api.stageHunk(repoPath, path, hunkIndex);
    },
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
    mutationFn: ({
      path,
      hunkIndex,
      lineIndices,
    }: {
      path: string;
      hunkIndex: number;
      lineIndices?: number[];
    }) => {
      if (!repoPath) throw new Error("no repo selected");
      return lineIndices
        ? api.unstageHunkLines(repoPath, path, hunkIndex, lineIndices)
        : api.unstageHunk(repoPath, path, hunkIndex);
    },
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
    mutationFn: ({
      path,
      hunkIndex,
      lineIndices,
    }: {
      path: string;
      hunkIndex: number;
      lineIndices?: number[];
    }) => {
      if (!repoPath) throw new Error("no repo selected");
      return lineIndices
        ? api.discardHunkLines(repoPath, path, hunkIndex, lineIndices)
        : api.discardHunk(repoPath, path, hunkIndex);
    },
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
    mutationFn: ({ path, side }: { path: string; side: "ours" | "theirs" }) => {
      if (!repoPath) throw new Error("no repo selected");
      return api.resolveConflict(repoPath, path, side);
    },
    onSuccess: invalidate,
  });
}

export function useResolveConflictWithContent(repoPath: string | null) {
  const invalidate = useInvalidateStatus(repoPath);
  return useMutation({
    mutationFn: ({ path, content }: { path: string; content: string }) => {
      if (!repoPath) throw new Error("no repo selected");
      return api.resolveConflictWithContent(repoPath, path, content);
    },
    onSuccess: invalidate,
  });
}
