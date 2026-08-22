import { create } from "zustand";
import { api } from "@/lib/tauri";
import { notify } from "@/lib/notify";
import { overallFrom, type Overall } from "@/components/pr/CIBadge";
import { useNetworkStore } from "./useNetworkStore";
import { isBrokenTokenError, useGitHubStore } from "./useGitHubStore";
import type { PullRequest, PullRequestFile, ReviewComment } from "@/lib/types";

export type PRFilter = "open" | "closed" | "all";

interface PRState {
  pulls: PullRequest[];
  loading: boolean;
  loadError: string | null;
  filter: PRFilter;
  page: number;
  hasMore: boolean;
  loadingMore: boolean;

  selectedNumber: number | null;
  files: PullRequestFile[];
  selectedFilePath: string | null;
  comments: ReviewComment[];

  watched: number[];
  ciOverall: Record<number, Overall>;

  setFilter: (filter: PRFilter) => void;
  toggleWatch: (number: number) => void;
  pollWatchedChecks: (repoPath: string, login: string) => Promise<void>;
  load: (repoPath: string, login: string) => Promise<void>;
  loadMore: (repoPath: string, login: string) => Promise<void>;
  selectPR: (repoPath: string, login: string, number: number | null) => Promise<void>;
  selectFile: (path: string | null) => void;
  addComment: (
    repoPath: string,
    login: string,
    line: number,
    side: "LEFT" | "RIGHT",
    body: string,
  ) => Promise<void>;
  createPR: (
    repoPath: string,
    login: string,
    title: string,
    head: string,
    base: string,
    body: string,
    draft: boolean,
    labels: string[],
    assignees: string[],
    reviewers: string[],
  ) => Promise<PullRequest>;
  mergePR: (repoPath: string, login: string, number: number, method: string) => Promise<void>;
}

export const usePRStore = create<PRState>((set, get) => ({
  pulls: [],
  loading: false,
  loadError: null,
  filter: "open",
  page: 1,
  hasMore: true,
  loadingMore: false,

  selectedNumber: null,
  files: [],
  selectedFilePath: null,
  comments: [],

  watched: [],
  ciOverall: {},

  setFilter: (filter) => set({ filter }),

  toggleWatch: (number) =>
    set((s) => ({
      watched: s.watched.includes(number) ? s.watched.filter((n) => n !== number) : [...s.watched, number],
    })),

  pollWatchedChecks: async (repoPath, login) => {
    const { watched, pulls, ciOverall } = get();
    if (watched.length === 0) return;
    const nextOverall = { ...ciOverall };
    for (const number of watched) {
      const pr = pulls.find((p) => p.number === number);
      if (!pr) continue;
      const runs = await api.githubListCheckRuns(repoPath, login, pr.head_sha).catch(() => []);
      const overall = overallFrom(runs);
      const previous = ciOverall[number];
      if (previous && previous !== overall && (overall === "passing" || overall === "failing")) {
        void notify(`CI ${overall}: #${number}`, pr.title);
      }
      nextOverall[number] = overall;
    }
    set({ ciOverall: nextOverall });
  },

  load: async (repoPath, login) => {
    set({ loading: true, loadError: null, page: 1, hasMore: true });
    try {
      const pulls = await api.githubListPullRequests(repoPath, login, get().filter, 1);
      set({ pulls, loading: false, hasMore: pulls.length === 50 });
      useNetworkStore.getState().noteSuccess();
      useGitHubStore.getState().setBrokenLogin(null);
    } catch (err) {
      const message = String(err);
      set({ loading: false, loadError: message });
      useNetworkStore.getState().noteError(message);
      if (isBrokenTokenError(message)) useGitHubStore.getState().setBrokenLogin(login);
    }
  },

  loadMore: async (repoPath, login) => {
    const { loadingMore, hasMore, filter, page, pulls } = get();
    if (loadingMore || !hasMore) return;
    set({ loadingMore: true });
    try {
      const nextPage = page + 1;
      const newPulls = await api.githubListPullRequests(repoPath, login, filter, nextPage);
      set({
        pulls: [...pulls, ...newPulls],
        page: nextPage,
        hasMore: newPulls.length === 50,
        loadingMore: false,
      });
      useNetworkStore.getState().noteSuccess();
    } catch (err) {
      const message = String(err);
      useNetworkStore.getState().noteError(message);
      set({ loadingMore: false });
    }
  },

  selectPR: async (repoPath, login, number) => {
    set({ selectedNumber: number, files: [], selectedFilePath: null, comments: [] });
    if (number == null) return;
    const [files, comments] = await Promise.all([
      api.githubListPullRequestFiles(repoPath, login, number),
      api.githubListReviewComments(repoPath, login, number),
    ]);
    if (get().selectedNumber !== number) return;
    set({ files, comments, selectedFilePath: files[0]?.filename ?? null });
  },

  selectFile: (path) => set({ selectedFilePath: path }),

  addComment: async (repoPath, login, line, side, body) => {
    const number = get().selectedNumber;
    const path = get().selectedFilePath;
    const pr = get().pulls.find((p) => p.number === number);
    if (!number || !path || !pr) return;
    const comment = await api.githubCreateReviewComment(
      repoPath,
      login,
      number,
      pr.head_sha,
      path,
      line,
      side,
      body,
    );
    set((s) => ({ comments: [...s.comments, comment] }));
  },

  createPR: async (repoPath, login, title, head, base, body, draft, labels, assignees, reviewers) => {
    const pr = await api.githubCreatePullRequest(repoPath, login, title, head, base, body, draft);
    // Labels/assignees/reviewers can only be attached once the PR (and its number) exists —
    // skip calls with nothing selected rather than sending pointless empty-array requests.
    await Promise.all([
      labels.length > 0 ? api.githubAddLabels(repoPath, login, pr.number, labels) : Promise.resolve(),
      assignees.length > 0 ? api.githubAddAssignees(repoPath, login, pr.number, assignees) : Promise.resolve(),
      reviewers.length > 0 ? api.githubRequestReviewers(repoPath, login, pr.number, reviewers) : Promise.resolve(),
    ]);
    await get().load(repoPath, login);
    return pr;
  },

  mergePR: async (repoPath, login, number, method) => {
    await api.githubMergePullRequest(repoPath, login, number, method);
    await get().load(repoPath, login);
  },
}));
