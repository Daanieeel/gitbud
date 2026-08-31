import { Button } from "@gitbud/ui/button";
import { PRDescription } from "./PRDescription";
import { PRTimeline } from "./PRTimeline";
import { PRCommentCompose } from "./PRCommentCompose";
import {
  useDeleteIssueComment,
  useIssueComments,
  useReviews,
  useTimelineEvents,
} from "@/hooks/queries/usePRConversation";
import { usePullRequestCommits } from "@/hooks/queries/usePRCommits";
import { prPollIntervalMs, useIsPrTabActive } from "@/hooks/queries/useCheckRuns";
import { usePRStore } from "@/store/usePRStore";
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
  const deleteComment = useDeleteIssueComment(repoPath, login, pr.number);
  const selectCommit = usePRStore((s) => s.selectCommit);
  const setQuotedReply = usePRStore((s) => s.setQuotedReply);
  const quotedReplyText = usePRStore((s) => s.quotedReplyText);
  const clearQuotedReply = usePRStore((s) => s.clearQuotedReply);

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
        repoPath={repoPath}
        login={login}
        comments={comments.comments}
        reviews={reviews.reviews}
        commits={commits.commits}
        ghEvents={ghEvents}
        onDeleteComment={(id) => deleteComment.mutate(id)}
        isMerged={pr.merged}
        isClosedNotMerged={!pr.merged && pr.state !== "open"}
        onSelectCommit={selectCommit}
        onQuoteReply={setQuotedReply}
        entityNoun="pull request"
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
      <PRCommentCompose
        repoPath={repoPath}
        login={login}
        number={pr.number}
        quotedReplyText={quotedReplyText}
        onConsumeQuotedReply={clearQuotedReply}
      />
    </div>
  );
}
