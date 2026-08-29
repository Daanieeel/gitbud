import { describe, expect, it } from "bun:test";
import { mergeReadiness } from "./mergeReadiness";
import type { CheckRun, CompareResult, PullRequest } from "./types";
import type { ReviewerStatus } from "./reviewerStatus";

type MergeabilityInput = Pick<PullRequest, "draft" | "merged" | "state" | "mergeable">;

function pr(overrides: Partial<MergeabilityInput> = {}): MergeabilityInput {
  return { draft: false, merged: false, state: "open", mergeable: true, ...overrides };
}

function check(name: string, status: string, conclusion: string | null): CheckRun {
  return { name, status, conclusion, html_url: "", started_at: null, completed_at: null };
}

function reviewer(status: ReviewerStatus) {
  return { status };
}

describe("mergeReadiness", () => {
  it("a draft PR can never merge, even with everything else green", () => {
    const result = mergeReadiness(pr({ draft: true }), [], [], [], null, null);
    expect(result.canMerge).toBe(false);
  });

  it("an already-merged PR can never merge again", () => {
    const result = mergeReadiness(pr({ merged: true, state: "closed" }), [], [], [], null, null);
    expect(result.canMerge).toBe(false);
  });

  it("one failing required check among passing optional ones blocks merge", () => {
    const runs = [
      check("required-ci", "completed", "failure"),
      check("optional-lint", "completed", "success"),
    ];
    const result = mergeReadiness(pr(), runs, ["required-ci"], [], null, null);
    expect(result.checksState).toBe("failing");
    expect(result.canMerge).toBe(false);
  });

  it("a failing optional check does not block merge when only required contexts are evaluated", () => {
    const runs = [
      check("required-ci", "completed", "success"),
      check("optional-lint", "completed", "failure"),
    ];
    const result = mergeReadiness(pr(), runs, ["required-ci"], [], null, null);
    expect(result.checksState).toBe("passing");
    expect(result.canMerge).toBe(true);
  });

  it("review count unmet blocks merge", () => {
    const result = mergeReadiness(pr(), [], [], [reviewer("approved")], 2, null);
    expect(result.reviewsState).toBe("unmet");
    expect(result.canMerge).toBe(false);
  });

  it("review count met once enough approvals are in", () => {
    const result = mergeReadiness(
      pr(),
      [],
      [],
      [reviewer("approved"), reviewer("approved")],
      2,
      null,
    );
    expect(result.reviewsState).toBe("met");
    expect(result.canMerge).toBe(true);
  });

  it("a changes-requested review blocks merge regardless of approval count", () => {
    const result = mergeReadiness(
      pr(),
      [],
      [],
      [reviewer("approved"), reviewer("changes_requested")],
      1,
      null,
    );
    expect(result.reviewsState).toBe("unmet");
    expect(result.canMerge).toBe(false);
  });

  it("mergeable === false reports conflicted and blocks merge", () => {
    const result = mergeReadiness(pr({ mergeable: false }), [], [], [], null, null);
    expect(result.conflictState).toBe("conflicted");
    expect(result.canMerge).toBe(false);
  });

  it("mergeable === null (still computing) reports unknown, not conflicted", () => {
    const result = mergeReadiness(pr({ mergeable: null }), [], [], [], null, null);
    expect(result.conflictState).toBe("unknown");
  });

  it("reports behindBy from the compare result", () => {
    const compare: CompareResult = { ahead_by: 3, behind_by: 7, status: "diverged" };
    const result = mergeReadiness(pr(), [], [], [], null, compare);
    expect(result.behindBy).toBe(7);
  });

  it("a fully clean PR with no requirements can merge", () => {
    const result = mergeReadiness(pr(), [], [], [], null, null);
    expect(result.canMerge).toBe(true);
    expect(result.checksState).toBe("none");
    expect(result.reviewsState).toBe("met");
  });
});
