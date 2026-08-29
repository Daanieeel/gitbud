import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";
import { useNetworkStore } from "@/store/useNetworkStore";
import type { ReviewThread } from "@/lib/types";

// Deliberately not cached to the SQLite mirror and not polled — see api.rs's `list_review_threads`
// doc comment: resolve/viewed state is per-viewer, cheap to refetch, and actively misleading if
// shown stale (a resolved thread looking unresolved after a rebase, or vice versa). A short
// staleTime plus refetch-on-window-focus keeps it reasonably fresh without polling machinery for
// something that only changes when someone acts on it.
const REVIEW_THREAD_STALE_MS = 15_000;

export function useReviewThreads(
  repoPath: string | null,
  login: string | null,
  number: number | null,
) {
  return useQuery({
    queryKey: queryKeys.reviewThreads(repoPath ?? "", login ?? "", number ?? -1),
    queryFn: async (): Promise<ReviewThread[]> => {
      if (!repoPath || !login || number === null) {
        throw new Error("useReviewThreads: query ran while disabled");
      }
      if (useNetworkStore.getState().shouldSkip()) {
        throw new Error("Skipping GitHub request: already offline.");
      }
      try {
        const threads = await api.githubListReviewThreads(repoPath, login, number);
        useNetworkStore.getState().noteSuccess();
        return threads;
      } catch (err) {
        useNetworkStore.getState().noteError(String(err));
        throw err;
      }
    },
    enabled: !!repoPath && !!login && number !== null,
    staleTime: REVIEW_THREAD_STALE_MS,
    refetchOnWindowFocus: true,
  });
}

export function useResolveThread(
  repoPath: string | null,
  login: string | null,
  number: number | null,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, resolved }: { threadId: string; resolved: boolean }) => {
      if (!repoPath || !login) throw new Error("useResolveThread: repoPath/login not set");
      return resolved
        ? api.githubResolveReviewThread(repoPath, login, threadId)
        : api.githubUnresolveReviewThread(repoPath, login, threadId);
    },
    onSuccess: (_void, { threadId, resolved }) => {
      if (!repoPath || !login || number === null) return;
      queryClient.setQueryData<ReviewThread[] | undefined>(
        queryKeys.reviewThreads(repoPath, login, number),
        (prev) => prev?.map((t) => (t.id === threadId ? { ...t, is_resolved: resolved } : t)),
      );
    },
  });
}

export function useViewedFiles(
  repoPath: string | null,
  login: string | null,
  number: number | null,
) {
  return useQuery({
    queryKey: queryKeys.viewedFiles(repoPath ?? "", login ?? "", number ?? -1),
    queryFn: async (): Promise<Set<string>> => {
      if (!repoPath || !login || number === null) {
        throw new Error("useViewedFiles: query ran while disabled");
      }
      if (useNetworkStore.getState().shouldSkip()) {
        throw new Error("Skipping GitHub request: already offline.");
      }
      try {
        const files = await api.githubListViewedFiles(repoPath, login, number);
        useNetworkStore.getState().noteSuccess();
        return new Set(files.filter(([, state]) => state === "VIEWED").map(([path]) => path));
      } catch (err) {
        useNetworkStore.getState().noteError(String(err));
        throw err;
      }
    },
    enabled: !!repoPath && !!login && number !== null,
    staleTime: REVIEW_THREAD_STALE_MS,
    refetchOnWindowFocus: true,
  });
}

export function useMarkFileViewed(
  repoPath: string | null,
  login: string | null,
  number: number | null,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ path, viewed }: { path: string; viewed: boolean }) => {
      if (!repoPath || !login || number === null) {
        throw new Error("useMarkFileViewed: repoPath/login/number not set");
      }
      return viewed
        ? api.githubMarkFileViewed(repoPath, login, number, path)
        : api.githubUnmarkFileViewed(repoPath, login, number, path);
    },
    onSuccess: (_void, { path, viewed }) => {
      if (!repoPath || !login || number === null) return;
      queryClient.setQueryData<Set<string> | undefined>(
        queryKeys.viewedFiles(repoPath, login, number),
        (prev) => {
          const next = new Set(prev ?? []);
          if (viewed) next.add(path);
          else next.delete(path);
          return next;
        },
      );
    },
  });
}
