import { api } from "./tauri";
import type { RepoMergeSettings } from "./types";

// In-flight prefetches only — not a result cache. A dialog reopen must always fire a genuinely
// fresh request (repo/branch rules can change between merges), so an entry here is consumed
// (removed) the moment something actually uses it; it exists purely to avoid firing a second,
// redundant request for one still in flight from an earlier prefetch.
const inFlight = new Map<string, Promise<RepoMergeSettings>>();

function key(repoPath: string, login: string, baseRef: string): string {
  return `${repoPath}|${login}|${baseRef}`;
}

/** Kicks off (and caches, until consumed) a merge-settings fetch ahead of time — e.g. as soon as
 * the Pull Requests tab loads a base branch's PRs, well before the user opens that PR's merge
 * dialog. Safe to call repeatedly for the same key; only the first call per key actually fires a
 * request. */
export function prefetchMergeSettings(repoPath: string, login: string, baseRef: string): void {
  const k = key(repoPath, login, baseRef);
  if (!inFlight.has(k)) {
    inFlight.set(k, api.githubGetRepoMergeSettings(repoPath, login, baseRef));
  }
}

/** Takes (and removes) a matching in-flight prefetch, if one hasn't already been consumed —
 * removing it here, rather than leaving it cached by result, is what keeps a *later* dialog
 * open firing its own fresh request instead of reusing this one. */
export function takePrefetchedMergeSettings(
  repoPath: string,
  login: string,
  baseRef: string,
): Promise<RepoMergeSettings> | null {
  const k = key(repoPath, login, baseRef);
  const promise = inFlight.get(k);
  if (promise) inFlight.delete(k);
  return promise ?? null;
}
