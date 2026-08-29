import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";
import { useNetworkStore } from "@/store/useNetworkStore";
import type { IssueComment, IssueTimelineEvent, Review } from "@/lib/types";

const CONVERSATION_PAGE_SIZE = 100;

/** Appends `item` to the last loaded page of an infinite-query cache entry — the optimistic-
 * update counterpart to `useIssueComments`/`useReviews` now that they page, in place of a flat
 * array's simple `[...prev, item]`. */
function appendToLastPage<T>(
  prev: InfiniteData<T[], number> | undefined,
  item: T,
): InfiniteData<T[], number> | undefined {
  if (!prev || prev.pages.length === 0) return prev;
  const pages = [...prev.pages];
  pages[pages.length - 1] = [...pages[pages.length - 1], item];
  return { ...prev, pages };
}

export function useIssueComments(
  repoPath: string | null,
  login: string | null,
  number: number | null,
  pollIntervalMs: number | null,
) {
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: queryKeys.prIssueComments(repoPath ?? "", login ?? "", number ?? -1),
    queryFn: async ({ pageParam }): Promise<IssueComment[]> => {
      if (!repoPath || !login || number === null) {
        throw new Error("useIssueComments: query ran while disabled");
      }
      if (pageParam === 1) {
        try {
          const cached = await api.getCachedIssueComments(repoPath, number);
          if (cached) {
            queryClient.setQueryData(
              queryKeys.prIssueComments(repoPath, login, number),
              (old: InfiniteData<IssueComment[], number> | undefined) =>
                old ?? { pages: [cached], pageParams: [1] },
            );
          }
        } catch {
          // Local mirror unavailable, fall through to the live fetch below.
        }
      }
      if (useNetworkStore.getState().shouldSkip()) {
        throw new Error("Skipping GitHub request: already offline.");
      }
      try {
        const comments = await api.githubListIssueComments(repoPath, login, number, pageParam);
        useNetworkStore.getState().noteSuccess();
        return comments;
      } catch (err) {
        useNetworkStore.getState().noteError(String(err));
        throw err;
      }
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === CONVERSATION_PAGE_SIZE ? allPages.length + 1 : undefined,
    enabled: !!repoPath && !!login && number !== null,
    refetchInterval: pollIntervalMs ?? false,
  });
  const comments: IssueComment[] = query.data?.pages.flat() ?? [];
  return { ...query, comments };
}

export function useReviews(
  repoPath: string | null,
  login: string | null,
  number: number | null,
  pollIntervalMs: number | null,
) {
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: queryKeys.prReviews(repoPath ?? "", login ?? "", number ?? -1),
    queryFn: async ({ pageParam }): Promise<Review[]> => {
      if (!repoPath || !login || number === null) {
        throw new Error("useReviews: query ran while disabled");
      }
      if (pageParam === 1) {
        try {
          const cached = await api.getCachedReviews(repoPath, number);
          if (cached) {
            queryClient.setQueryData(
              queryKeys.prReviews(repoPath, login, number),
              (old: InfiniteData<Review[], number> | undefined) =>
                old ?? { pages: [cached], pageParams: [1] },
            );
          }
        } catch {
          // Local mirror unavailable, fall through to the live fetch below.
        }
      }
      if (useNetworkStore.getState().shouldSkip()) {
        throw new Error("Skipping GitHub request: already offline.");
      }
      try {
        const reviews = await api.githubListReviews(repoPath, login, number, pageParam);
        useNetworkStore.getState().noteSuccess();
        return reviews;
      } catch (err) {
        useNetworkStore.getState().noteError(String(err));
        throw err;
      }
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === CONVERSATION_PAGE_SIZE ? allPages.length + 1 : undefined,
    enabled: !!repoPath && !!login && number !== null,
    refetchInterval: pollIntervalMs ?? false,
  });
  const reviews: Review[] = query.data?.pages.flat() ?? [];
  return { ...query, reviews };
}

/** Label/assignee/reviewer-request/close/reopen/merge events for the timeline — not cached to
 * the SQLite mirror (see `list_relevant_timeline_events`'s doc comment) and not seeded from a
 * cached-mirror read, so a fetch failure just means the timeline falls back to showing only
 * comments/reviews/commits rather than blocking the whole tab. Left as a plain (non-paginated)
 * query — GitHub's timeline endpoint is already filtered server-response-side down to a handful
 * of relevant kinds per PR, so paging it the same way as the noisier comment/review/commit lists
 * would be premature. */
export function useTimelineEvents(
  repoPath: string | null,
  login: string | null,
  number: number | null,
  pollIntervalMs: number | null,
) {
  return useQuery({
    queryKey: queryKeys.prTimelineEvents(repoPath ?? "", login ?? "", number ?? -1),
    queryFn: async (): Promise<IssueTimelineEvent[]> => {
      if (!repoPath || !login || number === null) {
        throw new Error("useTimelineEvents: query ran while disabled");
      }
      if (useNetworkStore.getState().shouldSkip()) {
        throw new Error("Skipping GitHub request: already offline.");
      }
      try {
        const events = await api.githubListRelevantTimelineEvents(repoPath, login, number);
        useNetworkStore.getState().noteSuccess();
        return events;
      } catch (err) {
        useNetworkStore.getState().noteError(String(err));
        throw err;
      }
    },
    enabled: !!repoPath && !!login && number !== null,
    refetchInterval: pollIntervalMs ?? false,
  });
}

export function useAddIssueComment(
  repoPath: string | null,
  login: string | null,
  number: number | null,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => {
      if (!repoPath || !login || number === null) {
        throw new Error("useAddIssueComment: repoPath/login/number not set");
      }
      return api.githubCreateIssueComment(repoPath, login, number, body);
    },
    onSuccess: (comment) => {
      if (!repoPath || !login || number === null) return;
      queryClient.setQueryData<InfiniteData<IssueComment[], number> | undefined>(
        queryKeys.prIssueComments(repoPath, login, number),
        (prev) => appendToLastPage(prev, comment),
      );
    },
    onError: (err) => toast.error(String(err)),
  });
}

export function useSubmitReview(
  repoPath: string | null,
  login: string | null,
  number: number | null,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      event,
      body,
    }: {
      event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT";
      body: string;
    }) => {
      if (!repoPath || !login || number === null) {
        throw new Error("useSubmitReview: repoPath/login/number not set");
      }
      return api.githubSubmitReview(repoPath, login, number, event, body);
    },
    onSuccess: (review) => {
      if (!repoPath || !login || number === null) return;
      queryClient.setQueryData<InfiniteData<Review[], number> | undefined>(
        queryKeys.prReviews(repoPath, login, number),
        (prev) => appendToLastPage(prev, review),
      );
    },
    onError: (err) => toast.error(String(err)),
  });
}
