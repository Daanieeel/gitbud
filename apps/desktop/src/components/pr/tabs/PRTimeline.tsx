import { useMemo } from "react";
import { mergeTimeline } from "@/lib/prTimeline";
import { PRTimelineEvent } from "./PRTimelineEvent";
import type { IssueComment, IssueTimelineEvent, PullRequestCommit, Review } from "@/lib/types";

interface PRTimelineProps {
  comments: IssueComment[];
  reviews: Review[];
  commits: PullRequestCommit[];
  ghEvents: IssueTimelineEvent[];
}

export function PRTimeline({ comments, reviews, commits, ghEvents }: PRTimelineProps) {
  const events = useMemo(
    () => mergeTimeline(comments, reviews, commits, ghEvents),
    [comments, reviews, commits, ghEvents],
  );

  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {events.map((event) => {
        const key =
          event.kind === "commit"
            ? `commit:${event.commit.sha}`
            : event.kind === "review"
              ? `review:${event.review.id}`
              : event.kind === "github_event"
                ? `gh:${event.ghEvent.id ?? `${event.ghEvent.event}:${event.timestamp}`}`
                : `comment:${event.comment.id}`;
        return <PRTimelineEvent key={key} event={event} />;
      })}
    </div>
  );
}
