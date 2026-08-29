import { describe, expect, it } from "bun:test";
import { deriveReviewerStatus } from "./reviewerStatus";
import type { AssignableUser, Review } from "./types";

function user(login: string): AssignableUser {
  return { login, avatar_url: `https://${login}` };
}

function review(login: string, state: string, submitted_at: string | null): Review {
  return {
    id: 1,
    user_login: login,
    user_avatar_url: `https://${login}`,
    state,
    body: "",
    submitted_at,
    html_url: "",
  };
}

describe("deriveReviewerStatus", () => {
  it("marks a requested reviewer with no review yet as pending", () => {
    const result = deriveReviewerStatus([user("alice")], []);
    expect(result).toEqual([{ login: "alice", avatar_url: "https://alice", status: "pending" }]);
  });

  it("reflects a submitted review's state for a requested reviewer", () => {
    const result = deriveReviewerStatus(
      [user("alice")],
      [review("alice", "APPROVED", "2024-01-01T00:00:00Z")],
    );
    expect(result).toEqual([{ login: "alice", avatar_url: "https://alice", status: "approved" }]);
  });

  it("uses the latest review when a reviewer re-reviews", () => {
    const result = deriveReviewerStatus(
      [user("alice")],
      [
        review("alice", "CHANGES_REQUESTED", "2024-01-01T00:00:00Z"),
        review("alice", "APPROVED", "2024-01-02T00:00:00Z"),
      ],
    );
    expect(result[0].status).toBe("approved");
  });

  it("includes a reviewer who reviewed without ever being in the requested list", () => {
    const result = deriveReviewerStatus([], [review("bob", "COMMENTED", "2024-01-01T00:00:00Z")]);
    expect(result).toEqual([{ login: "bob", avatar_url: "https://bob", status: "commented" }]);
  });

  it("ignores a PENDING (in-progress, unsubmitted) review", () => {
    const result = deriveReviewerStatus([user("alice")], [review("alice", "PENDING", null)]);
    expect(result[0].status).toBe("pending");
  });
});
