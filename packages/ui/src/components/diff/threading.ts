import type { ReviewComment } from "./types";

/** Groups a flat `ReviewComment[]` into threads by `in_reply_to_id` — each returned array is one
 * thread, root comment first, replies in their original order after it. A reply whose root isn't
 * in the input at all (e.g. the root was deleted, or hasn't loaded yet) becomes its own
 * single-comment "thread" rather than being dropped — never throws, never silently loses a
 * comment. */
export function groupCommentsIntoThreads(comments: ReviewComment[]): ReviewComment[][] {
  const byId = new Map(comments.map((c) => [c.id, c]));
  const roots: ReviewComment[] = [];
  const repliesByRoot = new Map<number, ReviewComment[]>();

  for (const comment of comments) {
    const rootId = resolveRootId(comment, byId);
    if (rootId === comment.id) {
      roots.push(comment);
    } else {
      const replies = repliesByRoot.get(rootId) ?? [];
      replies.push(comment);
      repliesByRoot.set(rootId, replies);
    }
  }

  return roots.map((root) => [root, ...(repliesByRoot.get(root.id) ?? [])]);
}

/** Walks `in_reply_to_id` up to the root, guarding against a cycle or a chain longer than the
 * input could possibly justify (defensive — GitHub never actually produces either). Falls back
 * to treating `comment` as its own root the moment the chain leaves the known set, so an
 * orphaned reply degrades gracefully instead of crashing. */
function resolveRootId(comment: ReviewComment, byId: Map<number, ReviewComment>): number {
  let current = comment;
  const seen = new Set<number>();
  while (current.in_reply_to_id !== null) {
    if (seen.has(current.id)) return comment.id;
    seen.add(current.id);
    const parent = byId.get(current.in_reply_to_id);
    if (!parent) return comment.id;
    current = parent;
  }
  return current.id;
}
