import type { ReviewComment } from "@gitbud/ui/diff-types";
import type { ReviewThread } from "@/lib/types";

/** Joins flat REST review comments against the GraphQL review-threads response by numeric id
 * (`ReviewThread.comment_database_ids` — GraphQL's `databaseId` on a `PullRequestReviewComment`
 * node *is* the REST comment id) to attach each comment's thread-resolved state. A comment with
 * no matching thread — posted this session before GitHub's GraphQL index caught up, or whose
 * thread was since deleted — degrades to `resolved: undefined` (renders as unresolved-looking)
 * rather than throwing; this is the one integration wrinkle in the whole review-threads feature
 * worth its own test coverage. */
export function joinCommentsWithThreads(
  comments: ReviewComment[],
  threads: ReviewThread[],
): ReviewComment[] {
  const resolvedByCommentId = new Map<number, boolean>();
  for (const thread of threads) {
    for (const id of thread.comment_database_ids) {
      resolvedByCommentId.set(id, thread.is_resolved);
    }
  }
  return comments.map((comment) => ({
    ...comment,
    resolved: resolvedByCommentId.get(comment.id),
  }));
}

/** The thread id a given (already-joined) comment belongs to, for reply/resolve actions — looked
 * up fresh from the raw thread list rather than carried on the comment itself, since a thread id
 * is a GraphQL-only concept `ReviewComment` otherwise has no reason to know about. `null` when no
 * thread is known yet for this comment (same degrade-gracefully case as above). */
export function threadIdForComment(commentId: number, threads: ReviewThread[]): string | null {
  const thread = threads.find((t) => t.comment_database_ids.includes(commentId));
  return thread?.id ?? null;
}
