import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";
import type { FileDiff, ImageDiff } from "@/lib/types";

export function useCommitFiles(repoPath: string | null, oid: string | null) {
  return useQuery({
    queryKey: queryKeys.commitFiles(repoPath ?? "", oid ?? ""),
    queryFn: () => api.getCommitFiles(repoPath as string, oid as string),
    enabled: !!repoPath && !!oid,
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
  });
}
