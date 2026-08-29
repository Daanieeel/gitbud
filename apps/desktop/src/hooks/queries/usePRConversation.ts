import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";
import { useNetworkStore } from "@/store/useNetworkStore";
import type { IssueComment, IssueTimelineEvent, Review } from "@/lib/types";

export function useIssueComments(
  repoPath: string | null,
  login: string | null,
  number: number | null,
  pollIntervalMs: number | null,
) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.prIssueComments(repoPath ?? "", login ?? "", number ?? -1),
    queryFn: async (): Promise<IssueComment[]> => {
      if (!repoPath || !login || number === null) {
        throw new Error("useIssueComments: query ran while disabled");
      }
      try {
        const cached = await api.getCachedIssueComments(repoPath, number);
        if (cached) {
          queryClient.setQueryData<IssueComment[] | undefined>(
            queryKeys.prIssueComments(repoPath, login, number),
            (old) => old ?? cached,
          );
        }
      } catch {
        // Local mirror unavailable, fall through to the live fetch below.
      }
      if (useNetworkStore.getState().shouldSkip()) {
        throw new Error("Skipping GitHub request: already offline.");
      }
      try {
        const comments = await api.githubListIssueComments(repoPath, login, number);
        useNetworkStore.getState().noteSuccess();
        return comments;
      } catch (err) {
        useNetworkStore.getState().noteError(String(err));
        throw err;
      }
    },
    enabled: !!repoPath && !!login && number !== null,
    refetchInterval: pollIntervalMs ?? false,
  });
}

export function useReviews(
  repoPath: string | null,
  login: string | null,
  number: number | null,
  pollIntervalMs: number | null,
) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.prReviews(repoPath ?? "", login ?? "", number ?? -1),
    queryFn: async (): Promise<Review[]> => {
      if (!repoPath || !login || number === null) {
        throw new Error("useReviews: query ran while disabled");
      }
      try {
        const cached = await api.getCachedReviews(repoPath, number);
        if (cached) {
          queryClient.setQueryData<Review[] | undefined>(
            queryKeys.prReviews(repoPath, login, number),
            (old) => old ?? cached,
          );
        }
      } catch {
        // Local mirror unavailable, fall through to the live fetch below.
      }
      if (useNetworkStore.getState().shouldSkip()) {
        throw new Error("Skipping GitHub request: already offline.");
      }
      try {
        const reviews = await api.githubListReviews(repoPath, login, number);
        useNetworkStore.getState().noteSuccess();
        return reviews;
      } catch (err) {
        useNetworkStore.getState().noteError(String(err));
        throw err;
      }
    },
    enabled: !!repoPath && !!login && number !== null,
    refetchInterval: pollIntervalMs ?? false,
  });
}

/** Label/assignee/reviewer-request/close/reopen/merge events for the timeline — not cached to
 * the SQLite mirror (see `list_relevant_timeline_events`'s doc comment) and not seeded from a
 * cached-mirror read, so a fetch failure just means the timeline falls back to showing only
 * comments/reviews/commits rather than blocking the whole tab. */
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
      queryClient.setQueryData<IssueComment[] | undefined>(
        queryKeys.prIssueComments(repoPath, login, number),
        (prev) => (prev ? [...prev, comment] : prev),
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
      queryClient.setQueryData<Review[] | undefined>(
        queryKeys.prReviews(repoPath, login, number),
        (prev) => (prev ? [...prev, review] : prev),
      );
    },
    onError: (err) => toast.error(String(err)),
  });
}
