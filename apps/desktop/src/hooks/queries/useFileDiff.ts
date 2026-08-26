import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";
import type { FileDiff, ImageDiff } from "@/lib/types";

interface WorkingFileDiff {
  staged: FileDiff;
  unstaged: FileDiff;
  imageDiff: ImageDiff | null;
}

/** The diff for a working-tree file, both staged and unstaged sides plus the whole-file image
 * diff when relevant — everything ChangesTab's DiffView needs for one selected file. */
export function useFileDiff(repoPath: string | null, path: string | null, entryStaged: boolean) {
  return useQuery({
    queryKey: queryKeys.fileDiff(repoPath ?? "", path ?? ""),
    queryFn: async (): Promise<WorkingFileDiff> => {
      if (!repoPath || !path) throw new Error("no repo/file selected");
      const [staged, unstaged] = await Promise.all([
        api.getFileDiff(repoPath, path, true),
        api.getFileDiff(repoPath, path, false),
      ]);
      // Whole-file image diffs have no staged/unstaged hunk split to show side by side — just
      // show whichever side is actually fully staged.
      const imageDiff = unstaged.is_image
        ? await api.getImageDiff(repoPath, path, entryStaged)
        : null;
      return { staged, unstaged, imageDiff };
    },
    enabled: !!repoPath && !!path,
  });
}
