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

// One shared tick for everything below — a single timer/visibility-listener pair instead of
// three, since they all want the same "only while visible" gating anyway.
const TICK_MS = 60_000;
// git fetch is a real network git operation (can transfer objects), materially pricier than a
// small REST GET — only run it every other tick so it's on its own, coarser cadence while
// check-runs/PR-list still refresh every tick.
const FETCH_EVERY_N_TICKS = 2;

function isWindowVisible() {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

/**
 * Keeps the app feeling up to date with the remote — collaboration is the whole point of a git
 * client, but everything else in this app is deliberately local-first (instant, offline-capable
 * reads straight off the local .git). This is the one place that reaches out on a timer to catch
 * what local-first can't see: what a teammate pushed.
 *
 * Three things, one shared interval, all gated the same way (paused while the window isn't
 * visible, with an immediate catch-up run on refocus — minimized/backgrounded costs nothing):
 *  - a silent `git fetch` for the selected repo, updating remote-tracking refs so ahead/behind
 *    counts and the remote branch list reflect what's actually on origin — never touches the
 *    working tree or local branches, so it's safe to run without the user asking
 *  - a refresh of the (already-cached) open-PR list, so a new PR or a new commit pushed to an
 *    existing one shows up without needing to leave and reopen the PR tab
 *  - CI status for watched (starred) PRs, unchanged from before — the desktop-notification
 *    trigger for "a PR I'm watching just went green/red"
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
  // manual sync starting/finishing doesn't tear down and recreate the timer.
  const watchedRef = useRef(watched);
  watchedRef.current = watched;
  const pullsRef = useRef(pulls);
  pullsRef.current = pulls;
  const manualSyncRef = useRef(manualSyncInFlight);
  manualSyncRef.current = manualSyncInFlight;

  useEffect(() => {
    if (!repoPath) return;
    let cancelled = false;
    let tick = 0;

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

    const runTick = async (isCatchUp: boolean) => {
      if (cancelled || !isWindowVisible()) return;
      // A refocus catch-up always includes a fetch — the whole point is "what changed while I
      // was away" — regardless of where the every-Nth-tick counter happened to land.
      if (isCatchUp || tick % FETCH_EVERY_N_TICKS === 0) void fetchRemote();
      refreshOpenPulls();
      await pollWatchedChecks();
      tick++;
    };

    void runTick(true);
    const interval = setInterval(() => void runTick(false), TICK_MS);
    const onVisibilityChange = () => {
      if (isWindowVisible()) void runTick(true);
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [repoPath, login, queryClient]);
}
