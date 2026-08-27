import { create } from "zustand";

// Matches the error text git/curl/reqwest produce for DNS/connection-level failures, as
// opposed to git-level failures (auth, conflicts, non-fast-forward, etc) that mean the remote
// *was* reached.
const NETWORK_ERROR_PATTERN =
  /could not resolve host|connection refused|network is unreachable|timed out|failed to connect|couldn't connect|name or service not known|temporary failure in name resolution|no route to host/i;

// Once marked offline, callers skip straight past the network call (see `shouldSkip` below)
// rather than re-attempting one that would just hang out to its connect timeout. The only things
// that clear `offline` are the OS `online` event and a call succeeding — but the OS event only
// fires on an actual interface state change, never for a connection that's merely slow/flaky
// while staying "online" the whole time. Without a way back in, that leaves `offline` stuck true
// forever once network turns bad-but-not-down. This interval lets one real attempt through
// periodically as a self-healing probe, even while still marked offline.
const RETRY_PROBE_INTERVAL_MS = 15_000;

interface NetworkState {
  offline: boolean;
  offlineSince: number | null;
  setOffline: (offline: boolean) => void;
  /** Call with any error message from a network-dependent action (fetch/pull/push/PR API) —
   * flips to offline only if the message looks like a connectivity failure. */
  noteError: (message: string) => void;
  /** Call on any successful network-dependent action — clears the offline flag. */
  noteSuccess: () => void;
  /** Whether a network-dependent call should skip straight to its offline error path instead of
   * attempting the request. Even while `offline`, lets a probe through every
   * `RETRY_PROBE_INTERVAL_MS` so a flaky-but-not-truly-down connection can self-heal without
   * waiting for an OS online/offline event. */
  shouldSkip: () => boolean;
}

export const useNetworkStore = create<NetworkState>((set, get) => ({
  // Tauri's webview always has `navigator` — no SSR/non-browser context to guard against here.
  offline: !navigator.onLine,
  offlineSince: navigator.onLine ? null : Date.now(),

  setOffline: (offline) => set({ offline, offlineSince: offline ? Date.now() : null }),

  noteError: (message) => {
    if (NETWORK_ERROR_PATTERN.test(message)) set({ offline: true, offlineSince: Date.now() });
  },

  noteSuccess: () => set({ offline: false, offlineSince: null }),

  shouldSkip: () => {
    const { offline, offlineSince } = get();
    if (!offline) return false;
    return offlineSince !== null && Date.now() - offlineSince < RETRY_PROBE_INTERVAL_MS;
  },
}));
