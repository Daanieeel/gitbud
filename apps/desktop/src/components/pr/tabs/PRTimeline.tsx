import { useMemo } from "react";
import { findMergedEventIndex, mergeTimeline } from "@/lib/prTimeline";
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
}

export function PRTimeline({
  repoPath,
  login,
  comments,
  reviews,
  commits,
  ghEvents,
  onDeleteComment,
}: PRTimelineProps) {
  const events = useMemo(
    () => mergeTimeline(comments, reviews, commits, ghEvents),
    [comments, reviews, commits, ghEvents],
  );
  const mergedIndex = useMemo(() => findMergedEventIndex(events), [events]);

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
        // The connecting line runs normally up through (and into) the merged row, then stops —
        // a thicker separator takes its place right after that row instead, and nothing after
        // it is connected to anything (see `findMergedEventIndex`'s doc comment).
        const showTopLine = i > 0 && (mergedIndex === -1 || i <= mergedIndex);
        const showBottomLine = i < events.length - 1 && (mergedIndex === -1 || i < mergedIndex);
        return (
          <div key={key}>
            <PRTimelineEvent
              event={event}
              repoPath={repoPath}
              login={login}
              showTopLine={showTopLine}
              showBottomLine={showBottomLine}
              onDeleteComment={onDeleteComment}
            />
            {i === mergedIndex && i < events.length - 1 && (
              <div className="my-2 border-t-2 border-accent-purple/40" />
            )}
          </div>
        );
      })}
    </div>
  );
}
