import { useMemo } from "react";
import { mergeTimeline } from "@/lib/prTimeline";
import { PRTimelineEvent } from "./PRTimelineEvent";
import type { IssueComment, PullRequestCommit, Review } from "@/lib/types";

interface PRTimelineProps {
  comments: IssueComment[];
  reviews: Review[];
  commits: PullRequestCommit[];
}

export function PRTimeline({ comments, reviews, commits }: PRTimelineProps) {
  const events = useMemo(
    () => mergeTimeline(comments, reviews, commits),
    [comments, reviews, commits],
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
              : `comment:${event.comment.id}`;
        return <PRTimelineEvent key={key} event={event} />;
      })}
    </div>
  );
}
