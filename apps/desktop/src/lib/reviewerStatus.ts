import type { AssignableUser, Review } from "./types";

export type ReviewerStatus =
  | "approved"
  | "changes_requested"
  | "commented"
  | "dismissed"
  | "pending";

// GitHub's raw review `state` enum values, mapped to our own reviewer-status vocabulary.
const REVIEW_STATE_TO_STATUS = {
  APPROVED: "approved",
  CHANGES_REQUESTED: "changes_requested",
  COMMENTED: "commented",
  DISMISSED: "dismissed",
} satisfies Record<string, ReviewerStatus>;

/** Looks up an open string key against a known-literal lookup table without widening the
 * table's own declared type, mirroring `CIBadge.tsx`'s identical helper for GitHub enum lookups. */
function lookup<T>(map: Record<string, T>, key: string, fallback: T): T {
  return Object.hasOwn(map, key) ? map[key] : fallback;
}

function statusForReviewState(state: string): ReviewerStatus {
  return lookup(REVIEW_STATE_TO_STATUS, state, "commented");
}

/** One row per person who's either been requested to review or has already reviewed, latest
 * review per person wins (a re-review supersedes an earlier one), defaulting anyone requested
 * but not yet reviewed to "pending" — this is what the sidebar's reviewer list renders. */
export function deriveReviewerStatus(
  requestedReviewers: AssignableUser[],
  reviews: Review[],
): { login: string; avatar_url: string; status: ReviewerStatus }[] {
  const latestByLogin = new Map<string, Review>();
  for (const review of reviews) {
    if (review.state === "PENDING") continue;
    const existing = latestByLogin.get(review.user_login);
    if (!existing || (review.submitted_at ?? "") >= (existing.submitted_at ?? "")) {
      latestByLogin.set(review.user_login, review);
    }
  }

  const rows = new Map<string, { login: string; avatar_url: string; status: ReviewerStatus }>();
  for (const [login, review] of latestByLogin) {
    rows.set(login, {
      login,
      avatar_url: review.user_avatar_url,
      status: statusForReviewState(review.state),
    });
  }
  for (const reviewer of requestedReviewers) {
    if (!rows.has(reviewer.login)) {
      rows.set(reviewer.login, {
        login: reviewer.login,
        avatar_url: reviewer.avatar_url,
        status: "pending",
      });
    }
  }
  return Array.from(rows.values());
}
