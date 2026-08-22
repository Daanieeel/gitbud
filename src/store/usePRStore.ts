import { create } from "zustand";
import { api } from "@/lib/tauri";
import type { PullRequest, PullRequestFile, ReviewComment } from "@/lib/types";

interface PRState {
  pulls: PullRequest[];
  loading: boolean;
  loadError: string | null;

  selectedNumber: number | null;
  files: PullRequestFile[];
  selectedFilePath: string | null;
  comments: ReviewComment[];

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

  selectedNumber: null,
  files: [],
  selectedFilePath: null,
  comments: [],

  load: async (repoPath, login) => {
    set({ loading: true, loadError: null });
    try {
      const pulls = await api.githubListPullRequests(repoPath, login);
      set({ pulls, loading: false });
    } catch (err) {
      set({ loading: false, loadError: String(err) });
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
