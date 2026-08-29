import { describe, expect, it } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { evictRepoScopedPrQueries, evictSelectedPrQueries } from "./prCacheEviction";
import { queryKeys } from "./queryKeys";

const repoPath = "/test/repo";
const login = "octocat";
const number = 7;

// Every query-key prefix a new PR data hook was given in this feature — if a new one is added to
// usePullRequests.ts/usePRCommits.ts/etc. without a matching entry in prCacheEviction.ts, this
// list (and only this list) needs updating too, which is exactly the point: a missed eviction is
// a silent memory-bloat regression, not a crash, so nothing else would ever catch it.
const REPO_SCOPED_SEED_KEYS = [
  ["pr-list", repoPath, login, "open"],
  ["pr-detail", repoPath, login, number],
  ["check-runs", repoPath, login, "sha"],
  ["pr-meta", repoPath, login, number],
  ["pr-commits", repoPath, login, number, "sha"],
  ["pr-issue-comments", repoPath, login, number],
  ["pr-timeline-events", repoPath, login, number],
  ["pr-reviews", repoPath, login, number],
  ["review-threads", repoPath, login, number],
  ["viewed-files", repoPath, login, number],
  ["pr-archived", repoPath, number],
  ["pr-labels", repoPath, login],
  ["assignable-users", repoPath, login],
  ["repo-teams", repoPath, login],
  ["repo-issues", repoPath, login],
  ["milestones", repoPath, login],
  ["projects", repoPath, login],
  ["issue-states", repoPath, login, [1, 2]],
];

describe("evictRepoScopedPrQueries", () => {
  it("removes every repo-scoped PR query family for that repo", () => {
    const qc = new QueryClient();
    for (const key of REPO_SCOPED_SEED_KEYS) qc.setQueryData(key, "data");

    evictRepoScopedPrQueries(qc, repoPath);

    for (const key of REPO_SCOPED_SEED_KEYS) {
      expect(qc.getQueryData(key)).toBeUndefined();
    }
  });

  it("leaves queries for a different repo untouched", () => {
    const qc = new QueryClient();
    qc.setQueryData(["pr-list", "/other/repo", login, "open"], "data");

    evictRepoScopedPrQueries(qc, repoPath);

    expect(qc.getQueryData(["pr-list", "/other/repo", login, "open"])).toBe("data");
  });
});

describe("evictSelectedPrQueries", () => {
  it("removes every per-PR query family for that PR number", () => {
    const qc = new QueryClient();
    qc.setQueryData(queryKeys.prDetail(repoPath, login, number), "data");
    qc.setQueryData(["pr-meta", repoPath, login, number], "data");
    qc.setQueryData(["pr-commits", repoPath, login, number, "sha"], "data");
    qc.setQueryData(queryKeys.prIssueComments(repoPath, login, number), "data");
    qc.setQueryData(queryKeys.prTimelineEvents(repoPath, login, number), "data");
    qc.setQueryData(queryKeys.prReviews(repoPath, login, number), "data");
    qc.setQueryData(queryKeys.reviewThreads(repoPath, login, number), "data");
    qc.setQueryData(queryKeys.viewedFiles(repoPath, login, number), "data");
    qc.setQueryData(queryKeys.prArchived(repoPath, number), "data");

    evictSelectedPrQueries(qc, repoPath, login, number);

    expect(qc.getQueryData(queryKeys.prDetail(repoPath, login, number))).toBeUndefined();
    expect(qc.getQueryData(["pr-meta", repoPath, login, number])).toBeUndefined();
    expect(qc.getQueryData(["pr-commits", repoPath, login, number, "sha"])).toBeUndefined();
    expect(qc.getQueryData(queryKeys.prIssueComments(repoPath, login, number))).toBeUndefined();
    expect(qc.getQueryData(queryKeys.prTimelineEvents(repoPath, login, number))).toBeUndefined();
    expect(qc.getQueryData(queryKeys.prReviews(repoPath, login, number))).toBeUndefined();
    expect(qc.getQueryData(queryKeys.reviewThreads(repoPath, login, number))).toBeUndefined();
    expect(qc.getQueryData(queryKeys.viewedFiles(repoPath, login, number))).toBeUndefined();
    expect(qc.getQueryData(queryKeys.prArchived(repoPath, number))).toBeUndefined();
  });

  it("leaves a different PR number's cache untouched", () => {
    const qc = new QueryClient();
    const otherNumber = 999;
    qc.setQueryData(queryKeys.prDetail(repoPath, login, otherNumber), "data");

    evictSelectedPrQueries(qc, repoPath, login, number);

    expect(qc.getQueryData(queryKeys.prDetail(repoPath, login, otherNumber))).toBe("data");
  });
});
