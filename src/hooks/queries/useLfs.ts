import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";

// Whether this repo tracks anything via LFS rarely changes mid-session — cache it long so
// switching repos back and forth doesn't re-invoke for a fact that basically never flips.
export function useHasLfs(repoPath: string | null) {
  return useQuery({
    queryKey: queryKeys.hasLfs(repoPath ?? ""),
    queryFn: () => api.hasLfs(repoPath as string),
    enabled: !!repoPath,
    staleTime: 10 * 60_000,
    initialData: false,
  });
}
