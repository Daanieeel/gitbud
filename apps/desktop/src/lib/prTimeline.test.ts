import { describe, expect, it } from "bun:test";
import { findClosedEventIndex, findMergedEventIndex, mergeTimeline } from "./prTimeline";
import type { IssueComment, IssueTimelineEvent, PullRequestCommit, Review } from "./types";

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
  return { id, user_login: "u", user_avatar_url: "", state, body, submitted_at, html_url: "" };
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

function ghEvent(
  event: string,
  created_at: string,
  overrides: Partial<IssueTimelineEvent> = {},
): IssueTimelineEvent {
  return {
    id: null,
    event,
    created_at,
    actor_login: "u",
    actor_avatar_url: "",
    label_name: null,
    label_color: null,
    assignee_login: null,
    assignee_avatar_url: null,
    requested_reviewer_login: null,
    requested_reviewer_avatar_url: null,
    source_issue_number: null,
    source_issue_title: null,
    source_issue_state: null,
    source_issue_html_url: null,
    source_issue_repo_full_name: null,
    source_issue_is_pull_request: null,
    ...overrides,
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

  it("interleaves GitHub label/reviewer/close events chronologically with the rest", () => {
    const events = mergeTimeline(
      [comment(1, "2024-01-02T00:00:00Z")],
      [],
      [],
      [ghEvent("labeled", "2024-01-01T00:00:00Z"), ghEvent("merged", "2024-01-03T00:00:00Z")],
    );
    expect(events.map((e) => e.kind)).toEqual(["github_event", "comment", "github_event"]);
  });

  it("defaults ghEvents to empty when omitted", () => {
    expect(mergeTimeline([], [], [])).toEqual([]);
  });
});

describe("mergeTimeline sub-issue/parent-issue grouping", () => {
  it("groups adjacent sub_issue_added events from the same actor into one related_issue_group", () => {
    const events = mergeTimeline(
      [],
      [],
      [],
      [
        ghEvent("sub_issue_added", "2024-01-01T00:00:00Z", {
          source_issue_number: 1,
          source_issue_title: "First",
          source_issue_state: "open",
        }),
        ghEvent("sub_issue_added", "2024-01-02T00:00:00Z", {
          source_issue_number: 2,
          source_issue_title: "Second",
          source_issue_state: "closed",
        }),
      ],
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "related_issue_group",
      relation: "sub_issue_added",
      refs: [
        { number: 1, title: "First", state: "open" },
        { number: 2, title: "Second", state: "closed" },
      ],
    });
  });

  it("does not merge sub_issue_added and parent_issue_added events together", () => {
    const events = mergeTimeline(
      [],
      [],
      [],
      [
        ghEvent("sub_issue_added", "2024-01-01T00:00:00Z", { source_issue_number: 1 }),
        ghEvent("parent_issue_added", "2024-01-02T00:00:00Z", { source_issue_number: 2 }),
      ],
    );
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ kind: "related_issue_group", relation: "sub_issue_added" });
    expect(events[1]).toMatchObject({
      kind: "related_issue_group",
      relation: "parent_issue_added",
    });
  });

  it("starts a new group when the actor changes", () => {
    const events = mergeTimeline(
      [],
      [],
      [],
      [
        ghEvent("sub_issue_added", "2024-01-01T00:00:00Z", {
          actor_login: "alice",
          source_issue_number: 1,
        }),
        ghEvent("sub_issue_added", "2024-01-02T00:00:00Z", {
          actor_login: "bob",
          source_issue_number: 2,
        }),
      ],
    );
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ actorLogin: "alice" });
    expect(events[1]).toMatchObject({ actorLogin: "bob" });
  });
});

describe("findMergedEventIndex", () => {
  it("finds the index of the merged event among mixed timeline kinds", () => {
    const events = mergeTimeline(
      [comment(1, "2024-01-01T00:00:00Z")],
      [],
      [],
      [ghEvent("merged", "2024-01-02T00:00:00Z")],
    );
    expect(findMergedEventIndex(events)).toBe(1);
  });

  it("returns -1 when there's no merged event", () => {
    const events = mergeTimeline([comment(1, "2024-01-01T00:00:00Z")], [], []);
    expect(findMergedEventIndex(events)).toBe(-1);
  });
});

describe("findClosedEventIndex", () => {
  it("finds the index of the closed event among mixed timeline kinds", () => {
    const events = mergeTimeline(
      [comment(1, "2024-01-01T00:00:00Z")],
      [],
      [],
      [ghEvent("closed", "2024-01-02T00:00:00Z")],
    );
    expect(findClosedEventIndex(events)).toBe(1);
  });

  it("finds the *last* closed event when the PR was closed more than once", () => {
    const events = mergeTimeline(
      [],
      [],
      [],
      [
        ghEvent("closed", "2024-01-01T00:00:00Z"),
        ghEvent("reopened", "2024-01-02T00:00:00Z"),
        ghEvent("closed", "2024-01-03T00:00:00Z"),
      ],
    );
    expect(findClosedEventIndex(events)).toBe(2);
  });

  it("returns -1 when there's no closed event", () => {
    const events = mergeTimeline([comment(1, "2024-01-01T00:00:00Z")], [], []);
    expect(findClosedEventIndex(events)).toBe(-1);
  });
});
