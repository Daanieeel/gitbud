import { create } from "zustand";

// Matches the error text git/curl/reqwest produce for DNS/connection-level failures, as
// opposed to git-level failures (auth, conflicts, non-fast-forward, etc) that mean the remote
// *was* reached.
const NETWORK_ERROR_PATTERN =
  /could not resolve host|connection refused|network is unreachable|timed out|failed to connect|couldn't connect|name or service not known|temporary failure in name resolution|no route to host/i;

interface NetworkState {
  offline: boolean;
  setOffline: (offline: boolean) => void;
  /** Call with any error message from a network-dependent action (fetch/pull/push/PR API) —
   * flips to offline only if the message looks like a connectivity failure. */
  noteError: (message: string) => void;
  /** Call on any successful network-dependent action — clears the offline flag. */
  noteSuccess: () => void;
}

export const useNetworkStore = create<NetworkState>((set) => ({
  // Tauri's webview always has `navigator` — no SSR/non-browser context to guard against here.
  offline: !navigator.onLine,

  setOffline: (offline) => set({ offline }),

  noteError: (message) => {
    if (NETWORK_ERROR_PATTERN.test(message)) set({ offline: true });
  },

  noteSuccess: () => set({ offline: false }),
}));
