import { QueryClient } from "@tanstack/react-query";
import { useNetworkStore } from "@/store/useNetworkStore";

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
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      retry: 1,
      networkMode: "always",
    },
    mutations: {
      networkMode: "always",
      onError: (err) => {
        useNetworkStore.getState().noteError(String(err));
      },
    },
  },
});
