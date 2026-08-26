import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";
import type { AheadBehind } from "@/lib/types";

export const DEFAULT_AHEAD_BEHIND: AheadBehind = {
  ahead: 0,
  behind: 0,
  published: true,
  head_on_remote: true,
};

export function useAheadBehind(repoPath: string | null) {
  return useQuery({
    queryKey: queryKeys.aheadBehind(repoPath ?? ""),
    queryFn: () => {
      if (!repoPath) throw new Error("useAheadBehind: query ran while disabled");
      return api.getAheadBehind(repoPath).catch(() => DEFAULT_AHEAD_BEHIND);
    },
    enabled: !!repoPath,
    initialData: DEFAULT_AHEAD_BEHIND,
  });
}

export function useRemoteProvider(repoPath: string | null) {
  return useQuery({
    queryKey: queryKeys.remoteProvider(repoPath ?? ""),
    queryFn: (): Promise<"github" | "other"> => {
      if (!repoPath) throw new Error("useRemoteProvider: query ran while disabled");
      return api
        .githubRemoteOwnerRepo(repoPath)
        .then((remote) => (remote ? "github" : "other"))
        .catch(() => "other");
    },
    enabled: !!repoPath,
  });
}
