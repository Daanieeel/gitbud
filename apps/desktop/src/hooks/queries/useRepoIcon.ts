import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";

/** Best-effort repo icon (favicon/logo file found in the working tree), as a data URI, or
 * `null` if none was found. Cached per repo path; the fs-watcher's repo-changed invalidation
 * (which targets the whole `queryKeys.repo(path)` branch) picks up an icon added or changed
 * later without any extra wiring here. */
export function useRepoIcon(repoPath: string | null | undefined) {
  const { data } = useQuery({
    queryKey: queryKeys.repoIcon(repoPath ?? ""),
    queryFn: () => {
      if (!repoPath) throw new Error("no repo selected");
      return api.getRepoIcon(repoPath);
    },
    enabled: !!repoPath,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  return data ?? null;
}
