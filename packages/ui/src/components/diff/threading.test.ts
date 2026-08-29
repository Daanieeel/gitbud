import { describe, expect, it } from "bun:test";
import { groupCommentsIntoThreads } from "./threading";
import type { ReviewComment } from "./types";

function comment(id: number, inReplyTo: number | null, body = "x"): ReviewComment {
  return {
    id,
    path: "a.ts",
    line: 1,
    side: "RIGHT",
    body,
    user_login: "u",
    user_avatar_url: "",
    created_at: "2024-01-01T00:00:00Z",
    in_reply_to_id: inReplyTo,
  };
}

describe("groupCommentsIntoThreads", () => {
  it("groups a root and its replies into one thread, root first", () => {
    const threads = groupCommentsIntoThreads([comment(1, null), comment(2, 1), comment(3, 1)]);
    expect(threads).toHaveLength(1);
    expect(threads[0].map((c) => c.id)).toEqual([1, 2, 3]);
  });

  it("keeps unrelated roots as separate threads", () => {
    const threads = groupCommentsIntoThreads([comment(1, null), comment(2, null)]);
    expect(threads).toHaveLength(2);
    expect(threads.map((t) => t[0].id)).toEqual([1, 2]);
  });

  it("resolves a multi-level reply chain to the original root", () => {
    const threads = groupCommentsIntoThreads([comment(1, null), comment(2, 1), comment(3, 2)]);
    expect(threads).toHaveLength(1);
    expect(threads[0].map((c) => c.id)).toEqual([1, 2, 3]);
  });

  it("degrades an orphaned reply (missing root) to its own thread instead of crashing", () => {
    const threads = groupCommentsIntoThreads([comment(2, 999)]);
    expect(threads).toHaveLength(1);
    expect(threads[0]).toEqual([comment(2, 999)]);
  });

  it("does not infinite-loop on a cyclic in_reply_to_id (defensive)", () => {
    const threads = groupCommentsIntoThreads([comment(1, 2), comment(2, 1)]);
    expect(
      threads
        .flat()
        .map((c) => c.id)
        .sort(),
    ).toEqual([1, 2]);
  });

  it("returns no threads for an empty input", () => {
    expect(groupCommentsIntoThreads([])).toEqual([]);
  });
});
