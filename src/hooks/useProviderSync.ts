import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";
import { overallFrom, type Overall } from "@/components/pr/CIBadge";
import { notify } from "@/lib/notify";
import type { PullRequest } from "@/lib/types";

const POLL_INTERVAL_MS = 60_000;

function isWindowVisible() {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

/**
 * Polls CI status for watched (starred) PRs on the selected repo — the desktop-notification
 * trigger for "a PR I'm watching just went green/red". GitHub gives a pure desktop client no
 * webhook/event channel for this, so polling is the only option; the one thing fully in this
 * app's control is making that polling as cheap as possible:
 *  - paused entirely while the window isn't visible (minimized/backgrounded/other tab), with an
 *    immediate catch-up poll on becoming visible again rather than waiting out the interval
 *  - scoped to only the PRs the user explicitly starred, not the whole visible list
 *  - written straight into the same query cache CIBadge reads from, so there's no separate
 *    fetch for the UI to also make when a watched PR's badge is on screen
 */
export function useProviderSync(
  repoPath: string | null,
  login: string | null,
  watched: number[],
  pulls: PullRequest[],
) {
  const queryClient = useQueryClient();
  const previousOverall = useRef<Map<number, Overall>>(new Map());
  // Interval/visibility setup only needs to happen once per (repoPath, login) — reading the
  // latest watched list and PR data through refs (instead of effect deps) means a PR list
  // refetch or the user starring another PR doesn't tear down and recreate the timer.
  const watchedRef = useRef(watched);
  watchedRef.current = watched;
  const pullsRef = useRef(pulls);
  pullsRef.current = pulls;

  useEffect(() => {
    if (!repoPath || !login) return;
    let cancelled = false;

    const poll = async () => {
      if (cancelled || !isWindowVisible()) return;
      for (const number of watchedRef.current) {
        const pr = pullsRef.current.find((p) => p.number === number);
        if (!pr) continue;
        const runs = await api.githubListCheckRuns(repoPath, login, pr.head_sha).catch(() => null);
        if (cancelled || !runs) continue;
        queryClient.setQueryData(queryKeys.checkRuns(repoPath, login, pr.head_sha), runs);
        const overall = overallFrom(runs);
        const previous = previousOverall.current.get(number);
        if (previous && previous !== overall && (overall === "passing" || overall === "failing")) {
          void notify(`CI ${overall}: #${number}`, pr.title);
        }
        previousOverall.current.set(number, overall);
      }
    };

    void poll();
    const interval = setInterval(() => void poll(), POLL_INTERVAL_MS);
    const onVisibilityChange = () => {
      if (isWindowVisible()) void poll();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [repoPath, login, queryClient]);
}
