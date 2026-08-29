import { describe, expect, it } from "bun:test";
import { mergeTimeline } from "./prTimeline";
import type { IssueComment, PullRequestCommit, Review } from "./types";

function comment(id: number, created_at: string): IssueComment {
  return {
    id,
    body: "hi",
    user_login: "u",
    user_avatar_url: "",
    created_at,
    updated_at: created_at,
    html_url: "",
  };
}

function review(id: number, submitted_at: string | null, state = "APPROVED", body = ""): Review {
  return { id, user_login: "u", user_avatar_url: "", state, body, submitted_at };
}

function commit(sha: string, authored_at: string | null): PullRequestCommit {
  return {
    sha,
    summary: "s",
    body: "",
    author_login: null,
    author_avatar_url: null,
    author_name: null,
    author_email: null,
    authored_at,
    html_url: "",
  };
}

describe("mergeTimeline", () => {
  it("sorts out-of-order events into chronological order", () => {
    const events = mergeTimeline(
      [comment(1, "2024-01-03T00:00:00Z")],
      [review(1, "2024-01-01T00:00:00Z")],
      [commit("abc", "2024-01-02T00:00:00Z")],
    );
    expect(events.map((e) => e.kind)).toEqual(["review", "commit", "comment"]);
  });

  it("discriminates event kind correctly for each input type", () => {
    const events = mergeTimeline(
      [comment(1, "2024-01-01T00:00:00Z")],
      [review(1, "2024-01-02T00:00:00Z")],
      [commit("abc", "2024-01-03T00:00:00Z")],
    );
    expect(events[0]).toMatchObject({ kind: "comment" });
    expect(events[1]).toMatchObject({ kind: "review" });
    expect(events[2]).toMatchObject({ kind: "commit" });
  });

  it("filters out PENDING reviews (an in-progress draft review, never a real timeline entry)", () => {
    const events = mergeTimeline([], [review(1, "2024-01-01T00:00:00Z", "PENDING")], []);
    expect(events).toHaveLength(0);
  });

  it("preserves an empty-body review's state, letting the renderer show verdict-only", () => {
    const events = mergeTimeline([], [review(1, "2024-01-01T00:00:00Z", "APPROVED", "")], []);
    expect(events[0]).toMatchObject({ kind: "review", review: { state: "APPROVED", body: "" } });
  });

  it("returns an empty list for no activity at all", () => {
    expect(mergeTimeline([], [], [])).toEqual([]);
  });
});
