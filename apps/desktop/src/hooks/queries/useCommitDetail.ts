import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";
import type { FileDiff, ImageDiff } from "@/lib/types";

// A commit's oid content-addresses it — its file list and diffs can never change underneath the
// same oid, so unlike everything else in this app, refetching on every mount (the global
// default — see queryClient.ts) would be pure waste here. Cache forever, fetch once.
const IMMUTABLE = { refetchOnMount: false as const, staleTime: Infinity };

export function useCommitDetail(repoPath: string | null, oid: string | null) {
  return useQuery({
    queryKey: queryKeys.commitDetail(repoPath ?? "", oid ?? ""),
    queryFn: () => {
      if (!repoPath || !oid) throw new Error("useCommitDetail: query ran while disabled");
      return api.getCommitDetail(repoPath, oid);
    },
    enabled: !!repoPath && !!oid,
    ...IMMUTABLE,
  });
}

export function useCommitFiles(repoPath: string | null, oid: string | null) {
  return useQuery({
    queryKey: queryKeys.commitFiles(repoPath ?? "", oid ?? ""),
    queryFn: () => {
      if (!repoPath || !oid) throw new Error("useCommitFiles: query ran while disabled");
      return api.getCommitFiles(repoPath, oid);
    },
    enabled: !!repoPath && !!oid,
    ...IMMUTABLE,
  });
}

interface CommitFileDiff {
  diff: FileDiff;
  imageDiff: ImageDiff | null;
}

export function useCommitFileDiff(
  repoPath: string | null,
  oid: string | null,
  path: string | null,
) {
  return useQuery({
    queryKey: queryKeys.commitFileDiff(repoPath ?? "", oid ?? "", path ?? ""),
    queryFn: async (): Promise<CommitFileDiff> => {
      if (!repoPath || !oid || !path)
        throw new Error("useCommitFileDiff: query ran while disabled");
      const diff = await api.getCommitFileDiff(repoPath, oid, path);
      const imageDiff = diff.is_image ? await api.getCommitImageDiff(repoPath, oid, path) : null;
      return { diff, imageDiff };
    },
    enabled: !!repoPath && !!oid && !!path,
    ...IMMUTABLE,
  });
}
