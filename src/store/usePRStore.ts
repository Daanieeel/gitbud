import { create } from "zustand";
import { api } from "@/lib/tauri";
import { notify } from "@/lib/notify";
import { overallFrom, type Overall } from "@/components/pr/CIBadge";
import { useNetworkStore } from "./useNetworkStore";
import type { PullRequest, PullRequestFile, ReviewComment } from "@/lib/types";

export type PRFilter = "open" | "closed" | "all";

interface PRState {
  pulls: PullRequest[];
  loading: boolean;
  loadError: string | null;
  filter: PRFilter;

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
  ) => Promise<void>;
  mergePR: (repoPath: string, login: string, number: number, method: string) => Promise<void>;
}

export const usePRStore = create<PRState>((set, get) => ({
  pulls: [],
  loading: false,
  loadError: null,
  filter: "open",

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
        void notify(`CI ${overall} — #${number}`, pr.title);
      }
      nextOverall[number] = overall;
    }
    set({ ciOverall: nextOverall });
  },

  load: async (repoPath, login) => {
    set({ loading: true, loadError: null });
    try {
      const pulls = await api.githubListPullRequests(repoPath, login, get().filter);
      set({ pulls, loading: false });
      useNetworkStore.getState().noteSuccess();
    } catch (err) {
      set({ loading: false, loadError: String(err) });
      useNetworkStore.getState().noteError(String(err));
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

  createPR: async (repoPath, login, title, head, base, body, draft) => {
    await api.githubCreatePullRequest(repoPath, login, title, head, base, body, draft);
    await get().load(repoPath, login);
  },

  mergePR: async (repoPath, login, number, method) => {
    await api.githubMergePullRequest(repoPath, login, number, method);
    await get().load(repoPath, login);
  },
}));
