import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./queryKeys";

/** Every repo-scoped GitHub/PR query-key prefix — evicted wholesale by `PRTab` on unmount or
 * repo switch (see `queryKeys.ts`'s domain comment for why these live outside the `["repo", ...]`
 * nesting other local-git queries use). Kept in one list so a newly-added PR query family can't
 * silently skip eviction — a missed one here is a slow memory-bloat regression, not a crash, so
 * nothing else would catch it. */
const REPO_SCOPED_PR_PREFIXES = [
  "pr-list",
  "pr-detail",
  "check-runs",
  "pr-meta",
  "pr-commits",
  "pr-issue-comments",
  "pr-timeline-events",
  "pr-reviews",
  "review-threads",
  "viewed-files",
  "pr-archived",
  "pr-labels",
  "assignable-users",
  "repo-teams",
  "repo-issues",
  "milestones",
  "projects",
  "issue-states",
  "issue-list",
  "issue-meta",
] as const;

/** Frees every PR-related query cached for `repoPath` — called when the Pulls tab is left
 * entirely or the user switches to a different repo while staying on it. */
export function evictRepoScopedPrQueries(queryClient: QueryClient, repoPath: string): void {
  for (const prefix of REPO_SCOPED_PR_PREFIXES) {
    queryClient.removeQueries({ queryKey: [prefix, repoPath] });
  }
}

/** Frees every query scoped to one specific PR number — called the moment a different PR is
 * selected, rather than waiting on `gcTime`, since a single large PR's parsed file diffs alone
 * can be hundreds of thousands of objects. */
export function evictSelectedPrQueries(
  queryClient: QueryClient,
  repoPath: string,
  login: string,
  number: number,
): void {
  queryClient.removeQueries({ queryKey: queryKeys.prDetail(repoPath, login, number) });
  queryClient.removeQueries({ queryKey: ["pr-meta", repoPath, login, number] });
  queryClient.removeQueries({ queryKey: ["pr-commits", repoPath, login, number] });
  queryClient.removeQueries({ queryKey: queryKeys.prIssueComments(repoPath, login, number) });
  queryClient.removeQueries({ queryKey: queryKeys.prTimelineEvents(repoPath, login, number) });
  queryClient.removeQueries({ queryKey: queryKeys.prReviews(repoPath, login, number) });
  queryClient.removeQueries({ queryKey: queryKeys.reviewThreads(repoPath, login, number) });
  queryClient.removeQueries({ queryKey: queryKeys.viewedFiles(repoPath, login, number) });
  queryClient.removeQueries({ queryKey: queryKeys.prArchived(repoPath, number) });
}

/** Frees every query scoped to one specific issue number — mirrors `evictSelectedPrQueries`,
 * called the moment a different issue is selected. */
export function evictSelectedIssueQueries(
  queryClient: QueryClient,
  repoPath: string,
  login: string,
  number: number,
): void {
  queryClient.removeQueries({ queryKey: queryKeys.issueMeta(repoPath, login, number) });
  queryClient.removeQueries({ queryKey: queryKeys.prIssueComments(repoPath, login, number) });
  queryClient.removeQueries({ queryKey: queryKeys.prTimelineEvents(repoPath, login, number) });
  queryClient.removeQueries({ queryKey: queryKeys.prArchived(repoPath, number) });
}
