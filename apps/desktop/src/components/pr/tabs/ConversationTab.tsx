import { Button } from "@gitbud/ui/button";
import { PRDescription } from "./PRDescription";
import { PRTimeline } from "./PRTimeline";
import { PRCommentCompose } from "./PRCommentCompose";
import { PRReviewSubmit } from "./PRReviewSubmit";
import { PRMergeReadiness } from "./PRMergeReadiness";
import { useIssueComments, useReviews, useTimelineEvents } from "@/hooks/queries/usePRConversation";
import { usePullRequestCommits } from "@/hooks/queries/usePRCommits";
import { prPollIntervalMs, useIsPrTabActive } from "@/hooks/queries/useCheckRuns";
import type { PullRequest } from "@/lib/types";

interface ConversationTabProps {
  repoPath: string;
  login: string;
  pr: PullRequest;
}

export function ConversationTab({ repoPath, login, pr }: ConversationTabProps) {
  const isPrTabActive = useIsPrTabActive();
  const pollIntervalMs = prPollIntervalMs(pr, isPrTabActive, true);
  const comments = useIssueComments(repoPath, login, pr.number, pollIntervalMs);
  const reviews = useReviews(repoPath, login, pr.number, pollIntervalMs);
  const commits = usePullRequestCommits(repoPath, login, pr.number, pr.head_sha);
  const { data: ghEvents = [] } = useTimelineEvents(repoPath, login, pr.number, pollIntervalMs);

  // GitHub rejects a new review submission on a closed/merged PR outright — same gate the
  // header already uses for the Merge button.
  const canReview = !pr.merged && pr.state === "open";

  // Comments/reviews/commits each page independently (see usePRConversation.ts/usePRCommits.ts)
  // but the timeline merges them into one feed, so "load more" has to mean "load whichever of
  // the three still has more" rather than three separate buttons for one visual list.
  const hasMoreActivity = comments.hasNextPage || reviews.hasNextPage || commits.hasNextPage;
  const loadingMoreActivity =
    comments.isFetchingNextPage || reviews.isFetchingNextPage || commits.isFetchingNextPage;
  const loadMoreActivity = () => {
    if (comments.hasNextPage) void comments.fetchNextPage();
    if (reviews.hasNextPage) void reviews.fetchNextPage();
    if (commits.hasNextPage) void commits.fetchNextPage();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
      <PRDescription repoPath={repoPath} login={login} pr={pr} />
      <PRTimeline
        comments={comments.comments}
        reviews={reviews.reviews}
        commits={commits.commits}
        ghEvents={ghEvents}
      />
      {hasMoreActivity && (
        // GitHub's comment/review/commit list endpoints return oldest-first, so the *next* page
        // is more recent activity, not older — this sits below the timeline, not above it.
        <Button
          size="sm"
          variant="secondary"
          className="self-center"
          disabled={loadingMoreActivity}
          onClick={loadMoreActivity}
        >
          {loadingMoreActivity ? "Loading…" : "Load more activity"}
        </Button>
      )}
      <PRCommentCompose repoPath={repoPath} login={login} number={pr.number} />
      {canReview && (
        <PRReviewSubmit
          repoPath={repoPath}
          login={login}
          number={pr.number}
          isOwnPr={pr.author_login === login}
        />
      )}
      <PRMergeReadiness repoPath={repoPath} login={login} pr={pr} />
    </div>
  );
}
