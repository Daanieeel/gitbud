import { describe, expect, it } from "bun:test";
import { joinCommentsWithThreads, threadIdForComment } from "./reviewThreadJoin";
import type { ReviewComment } from "@gitbud/ui/diff-types";
import type { ReviewThread } from "./types";

function comment(id: number): ReviewComment {
  return {
    id,
    path: "a.ts",
    line: 1,
    side: "RIGHT",
    body: "x",
    user_login: "u",
    user_avatar_url: "",
    created_at: "2024-01-01T00:00:00Z",
    in_reply_to_id: null,
  };
}

function thread(id: string, isResolved: boolean, commentIds: number[]): ReviewThread {
  return { id, is_resolved: isResolved, comment_database_ids: commentIds };
}

describe("joinCommentsWithThreads", () => {
  it("attaches resolved=true to comments whose thread is resolved", () => {
    const [joined] = joinCommentsWithThreads([comment(1)], [thread("t1", true, [1])]);
    expect(joined.resolved).toBe(true);
  });

  it("attaches resolved=false to comments whose thread is unresolved", () => {
    const [joined] = joinCommentsWithThreads([comment(1)], [thread("t1", false, [1])]);
    expect(joined.resolved).toBe(false);
  });

  it("degrades to resolved=undefined for a comment with no matching thread yet, without throwing", () => {
    const [joined] = joinCommentsWithThreads([comment(1)], []);
    expect(joined.resolved).toBeUndefined();
  });

  it("joins every comment in a multi-comment thread to the same resolved state", () => {
    const joined = joinCommentsWithThreads([comment(1), comment(2)], [thread("t1", true, [1, 2])]);
    expect(joined.every((c) => c.resolved === true)).toBe(true);
  });
});

describe("threadIdForComment", () => {
  it("finds the thread id containing the comment", () => {
    expect(threadIdForComment(2, [thread("t1", false, [1, 2])])).toBe("t1");
  });

  it("returns null when no thread contains the comment", () => {
    expect(threadIdForComment(99, [thread("t1", false, [1, 2])])).toBeNull();
  });
});
