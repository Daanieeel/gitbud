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
    queryFn: () => api.getCommitDetail(repoPath as string, oid as string),
    enabled: !!repoPath && !!oid,
    ...IMMUTABLE,
  });
}

export function useCommitFiles(repoPath: string | null, oid: string | null) {
  return useQuery({
    queryKey: queryKeys.commitFiles(repoPath ?? "", oid ?? ""),
    queryFn: () => api.getCommitFiles(repoPath as string, oid as string),
    enabled: !!repoPath && !!oid,
    ...IMMUTABLE,
  });
}

interface CommitFileDiff {
  diff: FileDiff;
  imageDiff: ImageDiff | null;
}

export function useCommitFileDiff(repoPath: string | null, oid: string | null, path: string | null) {
  return useQuery({
    queryKey: queryKeys.commitFileDiff(repoPath ?? "", oid ?? "", path ?? ""),
    queryFn: async (): Promise<CommitFileDiff> => {
      const diff = await api.getCommitFileDiff(repoPath as string, oid as string, path as string);
      const imageDiff = diff.is_image
        ? await api.getCommitImageDiff(repoPath as string, oid as string, path as string)
        : null;
      return { diff, imageDiff };
    },
    enabled: !!repoPath && !!oid && !!path,
    ...IMMUTABLE,
  });
}
