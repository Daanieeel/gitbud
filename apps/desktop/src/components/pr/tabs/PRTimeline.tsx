import { useMemo } from "react";
import { findClosedEventIndex, findMergedEventIndex, mergeTimeline } from "@/lib/prTimeline";
import { PRTimelineEvent } from "./PRTimelineEvent";
import type { IssueComment, IssueTimelineEvent, PullRequestCommit, Review } from "@/lib/types";

interface PRTimelineProps {
  repoPath: string;
  login: string;
  comments: IssueComment[];
  reviews: Review[];
  commits: PullRequestCommit[];
  ghEvents: IssueTimelineEvent[];
  onDeleteComment: (commentId: number) => void;
  isMerged: boolean;
  isClosedNotMerged: boolean;
  onSelectCommit: (sha: string) => void;
  onQuoteReply: (text: string) => void;
  entityNoun: "pull request" | "issue";
}

export function PRTimeline({
  repoPath,
  login,
  comments,
  reviews,
  commits,
  ghEvents,
  onDeleteComment,
  isMerged,
  isClosedNotMerged,
  onSelectCommit,
  onQuoteReply,
  entityNoun,
}: PRTimelineProps) {
  const events = useMemo(
    () => mergeTimeline(comments, reviews, commits, ghEvents),
    [comments, reviews, commits, ghEvents],
  );
  const mergedIndex = useMemo(() => findMergedEventIndex(events), [events]);
  // A closed-then-reopened PR's earlier "closed" event isn't the terminal state, so this is
  // only computed (and only ever wins over `mergedIndex` being -1) while the PR is *currently*
  // closed without merging — `findClosedEventIndex` alone can't tell an old close apart from
  // the current one, it just finds the last "closed" row in the list.
  const closedIndex = useMemo(
    () => (!isMerged && isClosedNotMerged ? findClosedEventIndex(events) : -1),
    [events, isMerged, isClosedNotMerged],
  );
  const terminalIndex = mergedIndex !== -1 ? mergedIndex : closedIndex;
  const terminalKind: "merged" | "closed" | null =
    mergedIndex !== -1 ? "merged" : closedIndex !== -1 ? "closed" : null;

  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  }

  return (
    <div className="flex flex-col">
      {events.map((event, i) => {
        const key =
          event.kind === "commit"
            ? `commit:${event.commit.sha}`
            : event.kind === "review"
              ? `review:${event.review.id}`
              : event.kind === "github_event"
                ? `gh:${event.ghEvent.id ?? `${event.ghEvent.event}:${event.timestamp}`}`
                : `comment:${event.comment.id}`;
        // The connecting line runs normally up through (and into) the terminal row (merged, or
        // closed-without-merging), then stops — a thicker separator takes its place right after
        // that row instead, and nothing after it is connected to anything.
        const showTopLine = i > 0 && (terminalIndex === -1 || i <= terminalIndex);
        const showBottomLine = i < events.length - 1 && (terminalIndex === -1 || i < terminalIndex);
        return (
          <div key={key}>
            <PRTimelineEvent
              event={event}
              repoPath={repoPath}
              login={login}
              showTopLine={showTopLine}
              showBottomLine={showBottomLine}
              onDeleteComment={onDeleteComment}
              isTerminalClosed={i === terminalIndex && terminalKind === "closed"}
              onSelectCommit={onSelectCommit}
              onQuoteReply={onQuoteReply}
              entityNoun={entityNoun}
            />
            {i === terminalIndex && i < events.length - 1 && (
              <div
                className={`my-2 border-t-2 ${terminalKind === "closed" ? "border-destructive/40" : "border-accent-purple/40"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
