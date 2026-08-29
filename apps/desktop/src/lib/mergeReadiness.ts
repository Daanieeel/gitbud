import type { CheckRun, CompareResult, PullRequest } from "./types";
import type { ReviewerStatus } from "./reviewerStatus";

export type ChecksState = "passing" | "failing" | "pending" | "none";
export type ReviewsState = "met" | "unmet";
export type ConflictState = "clean" | "conflicted" | "unknown";

export interface MergeReadiness {
  checksState: ChecksState;
  reviewsState: ReviewsState;
  conflictState: ConflictState;
  behindBy: number;
  canMerge: boolean;
}

const PASSING_CONCLUSIONS = ["success", "neutral", "skipped"];

function checksState(checkRuns: CheckRun[] | null, requiredContexts: string[]): ChecksState {
  if (checkRuns === null) return "none";
  const relevant =
    requiredContexts.length > 0
      ? checkRuns.filter((r) => requiredContexts.includes(r.name))
      : checkRuns;
  if (relevant.length === 0) return "none";
  if (relevant.some((r) => r.status !== "completed")) return "pending";
  if (relevant.some((r) => r.conclusion && !PASSING_CONCLUSIONS.includes(r.conclusion))) {
    return "failing";
  }
  return "passing";
}

function reviewsState(
  reviewerStatuses: { status: ReviewerStatus }[],
  requiredApprovingReviewCount: number | null,
): ReviewsState {
  if (reviewerStatuses.some((r) => r.status === "changes_requested")) return "unmet";
  if (!requiredApprovingReviewCount || requiredApprovingReviewCount <= 0) return "met";
  const approvedCount = reviewerStatuses.filter((r) => r.status === "approved").length;
  return approvedCount >= requiredApprovingReviewCount ? "met" : "unmet";
}

function conflictState(mergeable: boolean | null): ConflictState {
  if (mergeable === null) return "unknown";
  return mergeable ? "clean" : "conflicted";
}

/** Pure merge-readiness derivation, shared by `MergePRDialog` and the Conversation tab's
 * `PRMergeReadiness` panel so "why can't this merge" is computed in exactly one place. */
export function mergeReadiness(
  pr: Pick<PullRequest, "draft" | "merged" | "state" | "mergeable">,
  checkRuns: CheckRun[] | null,
  requiredContexts: string[],
  reviewerStatuses: { status: ReviewerStatus }[],
  requiredApprovingReviewCount: number | null,
  compare: CompareResult | null,
): MergeReadiness {
  const checks = checksState(checkRuns, requiredContexts);
  const reviews = reviewsState(reviewerStatuses, requiredApprovingReviewCount);
  const conflicts = conflictState(pr.mergeable);
  const behindBy = compare?.behind_by ?? 0;

  const canMerge =
    !pr.draft &&
    !pr.merged &&
    pr.state === "open" &&
    conflicts !== "conflicted" &&
    checks !== "failing" &&
    reviews === "met";

  return {
    checksState: checks,
    reviewsState: reviews,
    conflictState: conflicts,
    behindBy,
    canMerge,
  };
}
