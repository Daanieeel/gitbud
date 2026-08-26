import { QueryClient } from "@tanstack/react-query";
import { useNetworkStore } from "@/store/useNetworkStore";
import type { CacheLevel } from "@/lib/types";

// How long already-fetched, no-longer-viewed data (status, branches, log, diffs, stashes, ...)
// stays in the in-memory query cache before being freed. The user-facing "cache_level" setting
// (Settings > General) maps to one of these, applied at runtime via `applyCacheLevel` (see
// App.tsx). Scoped entirely to this frontend query cache — the always-on local SQLite mirror for
// GitHub PR data (pr_cache.rs) and that data's own deliberate eviction on leaving a PR/tab/repo
// (PRTab.tsx) are both a deliberate, separate, non-configurable cache layer, untouched by this
// setting at every level including "none".
export const GC_TIME_BY_CACHE_LEVEL = {
  none: 0,
  minimal: 5_000,
  balanced: 30_000,
  relaxed: 120_000,
} satisfies Record<CacheLevel, number>;

// staleTime governs a second, independent form of caching: whether data already in the cache is
// served as-is (no refetch) or treated as stale. At every other level this stays fixed regardless
// of gcTime (see below) — but "none" needs to mean *zero* caching, not just fast eviction once
// unobserved, so it's the one level where staleTime also collapses to 0: every mount/refocus/
// reconnect is treated as needing a genuinely fresh fetch, never served straight from cache.
const STALE_TIME_BY_CACHE_LEVEL = {
  none: 0,
  minimal: 30_000,
  balanced: 30_000,
  relaxed: 30_000,
} satisfies Record<CacheLevel, number>;

// Desktop app, single window, backend reachable over IPC (not HTTP) for anything but GitHub
// calls — most queries have nothing to gain from window-refocus/interval refetching, and
// re-fetching on every focus would just burn CPU/rate-limit budget for no benefit. Callers that
// genuinely need focus- or interval-driven refresh (GitHub PR/CI data) opt in explicitly.
//
// Deliberately NOT `refetchOnMount: "always"` as a global default: that option refetches on
// every render where the query is enabled, not just genuine mounts — the options object React
// Query compares is recreated every render, so it looks like a "new mount" every time. Several
// components have local keystroke state living next to an active query (typing a tag name next
// to useTags, a search term next to useBranches/useStatus, a commit message next to
// useCommitLog) — a global "always" would refetch on every keystroke in those. Where "the user
// just opened this" genuinely needs to force a fresh fetch (a popover/dialog opening, switching
// into a tab), that's done with an explicit one-shot `invalidateQueries` in an effect keyed on
// the open/mount transition itself, not a query option — see TagsPanel, ReflogPanel,
// MergePRDialog, PRTab, HistoryTab.
//
// `gcTime` varies by cache_level for every level: most of what's cached (status, branches, log,
// diffs, stashes, ...) is a cheap local git2 read, not a network call, so there's little to lose
// from freeing it soon after you've navigated away. GitHub PR data additionally has its own
// SQLite mirror (see pr_cache.rs) plus explicit eviction in PRTab.tsx, unaffected by this setting.
// `staleTime` only varies at "none" (see STALE_TIME_BY_CACHE_LEVEL above) — everywhere else it
// stays fixed.
function buildDefaultOptions(cacheLevel: CacheLevel) {
  return {
    queries: {
      staleTime: STALE_TIME_BY_CACHE_LEVEL[cacheLevel],
      gcTime: GC_TIME_BY_CACHE_LEVEL[cacheLevel],
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
      networkMode: "always" as const,
    },
    mutations: {
      networkMode: "always" as const,
      onError: (cause: unknown) => {
        useNetworkStore.getState().noteError(String(cause));
      },
    },
  };
}

export const queryClient = new QueryClient({
  defaultOptions: buildDefaultOptions("balanced"),
});

/** `QueryClient.setDefaultOptions` REPLACES the entire defaultOptions object rather than merging
 * into it (verified directly: passing just `{ queries: { gcTime } }` silently resets staleTime,
 * retry, and even the unrelated `mutations` defaults to library defaults). Always go through this
 * rather than calling `setDefaultOptions` directly, so nothing gets dropped by accident. */
export function applyCacheLevel(cacheLevel: CacheLevel) {
  queryClient.setDefaultOptions(buildDefaultOptions(cacheLevel));
}
