import { QueryClient } from "@tanstack/react-query";
import { useNetworkStore } from "@/store/useNetworkStore";

// Desktop app, single window, backend reachable over IPC (not HTTP) for anything but GitHub
// calls — most queries have nothing to gain from window-refocus/interval refetching, and
// re-fetching on every focus would just burn CPU/rate-limit budget for no benefit. Callers that
// genuinely need focus- or interval-driven refresh (GitHub PR/CI data) opt in explicitly.
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
