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
  const { data: comments = [] } = useIssueComments(repoPath, login, pr.number, pollIntervalMs);
  const { data: reviews = [] } = useReviews(repoPath, login, pr.number, pollIntervalMs);
  const { data: commits = [] } = usePullRequestCommits(repoPath, login, pr.number, pr.head_sha);
  const { data: ghEvents = [] } = useTimelineEvents(repoPath, login, pr.number, pollIntervalMs);

  // GitHub rejects a new review submission on a closed/merged PR outright — same gate the
  // header already uses for the Merge button.
  const canReview = !pr.merged && pr.state === "open";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
      <PRDescription repoPath={repoPath} login={login} pr={pr} />
      <PRTimeline comments={comments} reviews={reviews} commits={commits} ghEvents={ghEvents} />
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
