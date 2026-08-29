import type { IssueComment, IssueTimelineEvent, PullRequestCommit, Review } from "./types";

export type TimelineEvent =
  | { kind: "comment"; timestamp: string; comment: IssueComment }
  | { kind: "review"; timestamp: string; review: Review }
  | { kind: "commit"; timestamp: string; commit: PullRequestCommit }
  | { kind: "github_event"; timestamp: string; ghEvent: IssueTimelineEvent };

/** Merges issue comments, review submissions, commits, and GitHub's own label/assignee/
 * reviewer-request/close/reopen/merge events into one chronologically-sorted feed for the
 * Conversation tab. A `PENDING` review (one that hasn't been submitted yet, e.g. a draft the
 * reviewer is still writing inline comments against) never appears in the API response as
 * anything but the reviewer's own in-progress state, so it's filtered out here defensively — it
 * should never actually reach this function, but showing it as a timeline entry would be wrong
 * if it ever did. Events with no timestamp sort first (defensive, shouldn't happen in practice —
 * every comment/review/commit/timeline-event GitHub returns carries one). */
export function mergeTimeline(
  comments: IssueComment[],
  reviews: Review[],
  commits: PullRequestCommit[],
  ghEvents: IssueTimelineEvent[] = [],
): TimelineEvent[] {
  const events: TimelineEvent[] = [
    ...comments.map((comment): TimelineEvent => ({
      kind: "comment",
      timestamp: comment.created_at,
      comment,
    })),
    ...reviews
      .filter((review) => review.state !== "PENDING")
      .map((review): TimelineEvent => ({
        kind: "review",
        timestamp: review.submitted_at ?? "",
        review,
      })),
    ...commits.map((commit): TimelineEvent => ({
      kind: "commit",
      timestamp: commit.authored_at ?? "",
      commit,
    })),
    ...ghEvents.map((ghEvent): TimelineEvent => ({
      kind: "github_event",
      timestamp: ghEvent.created_at ?? "",
      ghEvent,
    })),
  ];
  events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return events;
}

/** Index of the "merged" event in a chronologically-sorted event list, or -1 if there isn't
 * one — the timeline's connecting line stops right after this row (see `PRTimeline.tsx`'s
 * per-row line-visibility logic and item 13's design ask). */
export function findMergedEventIndex(events: TimelineEvent[]): number {
  return events.findIndex((e) => e.kind === "github_event" && e.ghEvent.event === "merged");
}
