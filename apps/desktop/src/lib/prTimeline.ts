import type { IssueComment, IssueTimelineEvent, PullRequestCommit, Review } from "./types";

export type TimelineEvent =
  | { kind: "comment"; timestamp: string; comment: IssueComment }
  | { kind: "review"; timestamp: string; review: Review }
  | { kind: "commit"; timestamp: string; commit: PullRequestCommit }
  | { kind: "github_event"; timestamp: string; ghEvent: IssueTimelineEvent }
  | {
      kind: "cross_referenced_group";
      timestamp: string;
      actorLogin: string | null;
      actorAvatarUrl: string | null;
      refs: CrossReferencedRef[];
    }
  | {
      kind: "related_issue_group";
      timestamp: string;
      /** Which sub-issues relation this run of adjacent events represents — `sub_issue_added`
       * fires on the parent's own timeline ("added N sub-issues"), `parent_issue_added` fires
       * on the child's ("added this as a sub-issue of N issues"). */
      relation: "sub_issue_added" | "parent_issue_added";
      actorLogin: string | null;
      actorAvatarUrl: string | null;
      refs: CrossReferencedRef[];
    };

/** One issue/PR that mentioned this one — the per-row payload inside a `cross_referenced_group`
 * or `related_issue_group`. */
export interface CrossReferencedRef {
  number: number;
  title: string;
  state: string;
  isPullRequest: boolean;
  htmlUrl: string | null;
}

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
  return groupRelatedEvents(events);
}

/** Collapses consecutive `cross-referenced`/`sub_issue_added`/`parent_issue_added` events from
 * the same actor into one grouped row — GitHub fires one raw event per referenced/related issue,
 * but the web UI (and this one) shows "X mentioned this in N issues" (or "added N sub-issues")
 * followed by the list, not N separate rows. Only adjacent same-actor-same-relation runs are
 * merged, matching how GitHub's own timeline groups `cross-referenced` bursts (one PR/issue body
 * can `#123` several others at once); the sub-issues events are grouped the same way for
 * consistency, though in practice they rarely arrive back-to-back. */
function groupRelatedEvents(events: TimelineEvent[]): TimelineEvent[] {
  const result: TimelineEvent[] = [];
  for (const event of events) {
    if (event.kind !== "github_event") {
      result.push(event);
      continue;
    }
    const ghType = event.ghEvent.event;
    if (
      ghType !== "cross-referenced" &&
      ghType !== "sub_issue_added" &&
      ghType !== "parent_issue_added"
    ) {
      result.push(event);
      continue;
    }
    const ref: CrossReferencedRef = {
      number: event.ghEvent.source_issue_number ?? 0,
      title: event.ghEvent.source_issue_title ?? "",
      state: event.ghEvent.source_issue_state ?? "open",
      isPullRequest: event.ghEvent.source_issue_is_pull_request ?? false,
      htmlUrl: event.ghEvent.source_issue_html_url,
    };
    const prev = result[result.length - 1];
    if (ghType === "cross-referenced") {
      if (
        prev?.kind === "cross_referenced_group" &&
        prev.actorLogin === event.ghEvent.actor_login
      ) {
        prev.refs.push(ref);
        prev.timestamp = event.timestamp;
        continue;
      }
      result.push({
        kind: "cross_referenced_group",
        timestamp: event.timestamp,
        actorLogin: event.ghEvent.actor_login,
        actorAvatarUrl: event.ghEvent.actor_avatar_url,
        refs: [ref],
      });
      continue;
    }
    if (
      prev?.kind === "related_issue_group" &&
      prev.relation === ghType &&
      prev.actorLogin === event.ghEvent.actor_login
    ) {
      prev.refs.push(ref);
      prev.timestamp = event.timestamp;
      continue;
    }
    result.push({
      kind: "related_issue_group",
      timestamp: event.timestamp,
      relation: ghType,
      actorLogin: event.ghEvent.actor_login,
      actorAvatarUrl: event.ghEvent.actor_avatar_url,
      refs: [ref],
    });
  }
  return result;
}

/** Index of the "merged" event in a chronologically-sorted event list, or -1 if there isn't
 * one — the timeline's connecting line stops right after this row (see `PRTimeline.tsx`'s
 * per-row line-visibility logic and item 13's design ask). */
export function findMergedEventIndex(events: TimelineEvent[]): number {
  return events.findIndex((e) => e.kind === "github_event" && e.ghEvent.event === "merged");
}

/** Index of the *last* "closed" event in a chronologically-sorted event list, or -1 if there
 * isn't one — used only when the PR is currently closed-without-merging (`PRTimeline.tsx` gates
 * this against that live state), since a closed-then-reopened PR's earlier "closed" event isn't
 * the terminal state and shouldn't get the destructive line-stop treatment. */
export function findClosedEventIndex(events: TimelineEvent[]): number {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.kind === "github_event" && e.ghEvent.event === "closed") return i;
  }
  return -1;
}
