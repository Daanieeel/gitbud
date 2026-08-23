import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/tauri";
import { queryKeys } from "@/lib/queryKeys";
import { overallFrom, type Overall } from "@/components/pr/CIBadge";
import { notify } from "@/lib/notify";
import { useNetworkStore } from "@/store/useNetworkStore";
import { useRepoStore } from "@/store/useRepoStore";
import { useRepoSyncing } from "@/hooks/queries/useGitSync";
import type { PullRequest } from "@/lib/types";

// The open-PR list and watched-PR CI checks are cheap REST GETs — poll them fast right after
// opening the app or switching repos (when "did anything change" is most likely to matter and
// most worth answering quickly), then back off to a steady-state cadence once that initial
// window has passed and nothing's actively being waited on.
const BURST_DURATION_MS = 5 * 60_000;
const BURST_INTERVAL_MS = 5_000;
const STEADY_INTERVAL_MS = 30_000;
// git fetch is a real network git operation (ref advertisement + object transfer), materially
// pricier than a small REST GET — kept on its own slower, constant cadence rather than riding
// the burst/steady schedule above.
const FETCH_INTERVAL_MS = 90_000;

function isWindowVisible() {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

/**
 * Keeps the app feeling up to date with the remote — collaboration is the whole point of a git
 * client, but everything else in this app is deliberately local-first (instant, offline-capable
 * reads straight off the local .git). This is the one place that reaches out on a timer to catch
 * what local-first can't see: what a teammate pushed.
 *
 * Three things, all paused while the window isn't visible (minimized/backgrounded/another tab
 * costs nothing) and refreshed once immediately on becoming visible again:
 *  - a silent `git fetch` for the selected repo, updating remote-tracking refs so ahead/behind
 *    counts and the remote branch list reflect what's actually on origin — never touches the
 *    working tree or local branches, so it's safe to run without the user asking. Runs on its
 *    own constant, slow interval — see FETCH_INTERVAL_MS above for why.
 *  - a refresh of the (already-cached) open-PR list, so a new PR or a new commit pushed to an
 *    existing one shows up without needing to leave and reopen the PR tab
 *  - CI status for watched (starred) PRs, unchanged from before — the desktop-notification
 *    trigger for "a PR I'm watching just went green/red"
 * The latter two share a burst-then-steady-state schedule (see constants above), reset whenever
 * this repo/login is (re)selected — not on every window refocus, so alt-tabbing back and forth
 * doesn't perpetually re-arm the fast interval. A plain refocus still gets one immediate refresh
 * of all three (via the visibilitychange listener below), just not a sustained fast window.
 *
 * Skips its own fetch step entirely while a manual sync (the toolbar's fetch/pull/push/sync
 * button) is already running for this repo, so it never races or duplicates that work.
 */
export function useProviderSync(
  repoPath: string | null,
  login: string | null,
  watched: number[],
  pulls: PullRequest[],
) {
  const queryClient = useQueryClient();
  const previousOverall = useRef<Map<number, Overall>>(new Map());
  const manualSyncInFlight = useRepoSyncing(repoPath);
  // Interval/visibility setup only needs to happen once per (repoPath, login) — reading
  // everything else through refs means a PR list refetch, the user starring another PR, or a
  // manual sync starting/finishing doesn't tear down and recreate the timers.
  const watchedRef = useRef(watched);
  watchedRef.current = watched;
  const pullsRef = useRef(pulls);
  pullsRef.current = pulls;
  const manualSyncRef = useRef(manualSyncInFlight);
  manualSyncRef.current = manualSyncInFlight;

  useEffect(() => {
    if (!repoPath) return;
    let cancelled = false;
    const burstStartedAt = Date.now();

    const fetchRemote = async () => {
      if (manualSyncRef.current) return;
      try {
        await api.gitFetch(repoPath);
        if (cancelled) return;
        useNetworkStore.getState().noteSuccess();
        void queryClient.invalidateQueries({ queryKey: queryKeys.branches(repoPath) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.aheadBehind(repoPath) });
        void useRepoStore.getState().loadRepos();
      } catch (err) {
        if (!cancelled) useNetworkStore.getState().noteError(String(err));
      }
    };

    const refreshOpenPulls = () => {
      if (!login) return;
      void queryClient.invalidateQueries({ queryKey: queryKeys.prList(repoPath, login, "open") });
    };

    const pollWatchedChecks = async () => {
      if (!login) return;
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

    const runCheapCheck = async () => {
      if (cancelled || !isWindowVisible()) return;
      refreshOpenPulls();
      await pollWatchedChecks();
    };

    // Self-rescheduling rather than setInterval, since the delay itself changes (fast → steady)
    // partway through — a fixed setInterval can't do that without being torn down and recreated.
    // The burst clock runs in real wall-time from when this repo/login was selected, regardless
    // of visibility — the simplification being that a repo left backgrounded for the whole burst
    // window and only looked at afterward gets the steady (slower) cadence from then on rather
    // than a fresh burst, on the logic that the one immediate refresh below already caught it up.
    let cheapTimer: ReturnType<typeof setTimeout>;
    const scheduleCheapCheck = () => {
      const elapsed = Date.now() - burstStartedAt;
      const delay = elapsed < BURST_DURATION_MS ? BURST_INTERVAL_MS : STEADY_INTERVAL_MS;
      cheapTimer = setTimeout(() => {
        void runCheapCheck().finally(() => {
          if (!cancelled) scheduleCheapCheck();
        });
      }, delay);
    };

    void runCheapCheck();
    scheduleCheapCheck();
    void fetchRemote();
    const fetchTimer = setInterval(() => void fetchRemote(), FETCH_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (!isWindowVisible()) return;
      void fetchRemote();
      void runCheapCheck();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      clearTimeout(cheapTimer);
      clearInterval(fetchTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [repoPath, login, queryClient]);
}
