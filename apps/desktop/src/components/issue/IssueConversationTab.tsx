import { Button } from "@gitbud/ui/button";
import { IssueDescription } from "./IssueDescription";
import { PRTimeline } from "@/components/pr/tabs/PRTimeline";
import { PRCommentCompose } from "@/components/pr/tabs/PRCommentCompose";
import {
  useDeleteIssueComment,
  useIssueComments,
  useTimelineEvents,
} from "@/hooks/queries/usePRConversation";
import { useIssueStore } from "@/store/useIssueStore";
import type { Issue } from "@/lib/types";

interface IssueConversationTabProps {
  repoPath: string;
  login: string;
  issue: Issue;
}

/** Wires the issue's comments/timeline events into the same `PRTimeline`/`PRCommentCompose`
 * components the PR tab uses (see their generalization for `entityNoun`/`onSelectCommit`/
 * `onQuoteReply` props) — `reviews`/`commits` are always empty since issues have neither. */
export function IssueConversationTab({ repoPath, login, issue }: IssueConversationTabProps) {
  const comments = useIssueComments(repoPath, login, issue.number, 60_000);
  const { data: ghEvents = [] } = useTimelineEvents(repoPath, login, issue.number, 60_000);
  const deleteComment = useDeleteIssueComment(repoPath, login, issue.number);
  const setQuotedReply = useIssueStore((s) => s.setQuotedReply);
  const quotedReplyText = useIssueStore((s) => s.quotedReplyText);
  const clearQuotedReply = useIssueStore((s) => s.clearQuotedReply);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3">
      <IssueDescription repoPath={repoPath} login={login} issue={issue} />
      <PRTimeline
        repoPath={repoPath}
        login={login}
        comments={comments.comments}
        reviews={[]}
        commits={[]}
        ghEvents={ghEvents}
        onDeleteComment={(id) => deleteComment.mutate(id)}
        isMerged={false}
        isClosedNotMerged={issue.state !== "open"}
        onSelectCommit={() => {}}
        onQuoteReply={setQuotedReply}
        entityNoun="issue"
      />
      {comments.hasNextPage && (
        <Button
          size="sm"
          variant="secondary"
          className="self-center"
          disabled={comments.isFetchingNextPage}
          onClick={() => void comments.fetchNextPage()}
        >
          {comments.isFetchingNextPage ? "Loading…" : "Load more activity"}
        </Button>
      )}
      <PRCommentCompose
        repoPath={repoPath}
        login={login}
        number={issue.number}
        quotedReplyText={quotedReplyText}
        onConsumeQuotedReply={clearQuotedReply}
      />
    </div>
  );
}
