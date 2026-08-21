import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { api } from "@/lib/tauri";
import type {
  AheadBehind,
  BranchInfo,
  CommitEntry,
  FileDiff,
  GitOutputLine,
  RepoEntry,
  RepoStatus,
} from "@/lib/types";

const LOG_PAGE_SIZE = 100;

interface RepoState {
  repos: RepoEntry[];
  selectedRepo: string | null;
  branch: string | null;
  branches: BranchInfo[];
  status: RepoStatus | null;
  selectedFilePath: string | null;
  selectedFileDiff: FileDiff | null;

  activeTab: "changes" | "history";

  commits: CommitEntry[];
  historyExhausted: boolean;
  selectedCommitOid: string | null;
  selectedCommitFiles: [string, string][];
  selectedCommitFilePath: string | null;
  selectedCommitDiff: FileDiff | null;

  aheadBehind: AheadBehind;
  syncing: boolean;
  syncLog: GitOutputLine[];

  globalListenersReady: boolean;

  initGlobalListeners: () => Promise<void>;
  loadRepos: () => Promise<void>;
  selectRepo: (path: string) => Promise<void>;
  refreshStatus: () => Promise<void>;
  refreshBranches: () => Promise<void>;
  refreshAheadBehind: () => Promise<void>;
  setActiveTab: (tab: "changes" | "history") => void;

  toggleStaged: (paths: string[], staged: boolean) => Promise<void>;
  selectFile: (path: string | null) => Promise<void>;
  doCommit: (summary: string, description: string) => Promise<void>;

  checkoutBranch: (branch: string) => Promise<void>;
  createBranch: (name: string, checkout: boolean) => Promise<void>;

  resetHistory: () => Promise<void>;
  loadMoreHistory: () => Promise<void>;
  selectCommit: (oid: string | null) => Promise<void>;
  selectCommitFile: (path: string | null) => Promise<void>;

  fetch: () => Promise<void>;
  pull: () => Promise<void>;
  push: () => Promise<void>;

  addExistingRepo: (path: string) => Promise<void>;
  cloneRepo: (url: string, dest: string) => Promise<void>;
  createNewRepo: (path: string) => Promise<void>;
  removeRepo: (path: string) => Promise<void>;
}

export const useRepoStore = create<RepoState>((set, get) => ({
  repos: [],
  selectedRepo: null,
  branch: null,
  branches: [],
  status: null,
  selectedFilePath: null,
  selectedFileDiff: null,

  activeTab: "changes",

  commits: [],
  historyExhausted: false,
  selectedCommitOid: null,
  selectedCommitFiles: [],
  selectedCommitFilePath: null,
  selectedCommitDiff: null,

  aheadBehind: { ahead: 0, behind: 0 },
  syncing: false,
  syncLog: [],

  globalListenersReady: false,

  initGlobalListeners: async () => {
    if (get().globalListenersReady) return;
    set({ globalListenersReady: true });
    await listen<string>("repo-changed", (event) => {
      if (event.payload === get().selectedRepo) {
        void get().refreshStatus();
      }
    });
  },

  loadRepos: async () => {
    const repos = await api.loadRepos();
    set({ repos });
    if (!get().selectedRepo && repos.length > 0) {
      await get().selectRepo(repos[0].path);
    }
  },

  selectRepo: async (path) => {
    const prev = get().selectedRepo;
    if (prev === path) return;
    if (prev) await api.stopWatch(prev).catch(() => {});

    set({
      selectedRepo: path,
      status: null,
      selectedFilePath: null,
      selectedFileDiff: null,
      commits: [],
      historyExhausted: false,
      selectedCommitOid: null,
      selectedCommitFiles: [],
      selectedCommitFilePath: null,
      selectedCommitDiff: null,
      aheadBehind: { ahead: 0, behind: 0 },
    });

    await api.startWatch(path).catch(() => {});
    await Promise.all([
      get().refreshStatus(),
      get().refreshBranches(),
      get().loadMoreHistory(),
      get().refreshAheadBehind(),
    ]);
  },

  refreshStatus: async () => {
    const repoPath = get().selectedRepo;
    if (!repoPath) return;
    const status = await api.getStatus(repoPath);
    set({ status });

    const selected = get().selectedFilePath;
    if (selected && !status.files.some((f) => f.path === selected)) {
      set({ selectedFilePath: null, selectedFileDiff: null });
    } else if (selected) {
      await get().selectFile(selected);
    }
  },

  refreshBranches: async () => {
    const repoPath = get().selectedRepo;
    if (!repoPath) return;
    const [branch, branches] = await Promise.all([
      api.getCurrentBranch(repoPath),
      api.listBranches(repoPath),
    ]);
    set({ branch, branches });
  },

  refreshAheadBehind: async () => {
    const repoPath = get().selectedRepo;
    if (!repoPath) return;
    try {
      const aheadBehind = await api.getAheadBehind(repoPath);
      if (get().selectedRepo === repoPath) set({ aheadBehind });
    } catch {
      if (get().selectedRepo === repoPath) set({ aheadBehind: { ahead: 0, behind: 0 } });
    }
  },

  setActiveTab: (tab) => set({ activeTab: tab }),

  toggleStaged: async (paths, staged) => {
    const repoPath = get().selectedRepo;
    if (!repoPath) return;
    if (staged) {
      await api.stagePaths(repoPath, paths);
    } else {
      await api.unstagePaths(repoPath, paths);
    }
    await get().refreshStatus();
  },

  selectFile: async (path) => {
    set({ selectedFilePath: path });
    const repoPath = get().selectedRepo;
    if (!repoPath || !path) {
      set({ selectedFileDiff: null });
      return;
    }
    const entry = get().status?.files.find((f) => f.path === path);
    const staged = entry?.staged ?? false;
    try {
      const diff = await api.getFileDiff(repoPath, path, staged);
      if (get().selectedFilePath === path) set({ selectedFileDiff: diff });
    } catch {
      if (get().selectedFilePath === path) set({ selectedFileDiff: null });
    }
  },

  doCommit: async (summary, description) => {
    const repoPath = get().selectedRepo;
    if (!repoPath) return;
    await api.commit(repoPath, summary, description);
    set({ selectedFilePath: null, selectedFileDiff: null });
    await Promise.all([get().refreshStatus(), get().resetHistory()]);
  },

  checkoutBranch: async (branch) => {
    const repoPath = get().selectedRepo;
    if (!repoPath) return;
    await api.checkoutBranch(repoPath, branch);
    await Promise.all([get().refreshBranches(), get().refreshStatus(), get().resetHistory()]);
  },

  createBranch: async (name, checkout) => {
    const repoPath = get().selectedRepo;
    if (!repoPath) return;
    await api.createBranch(repoPath, name, checkout);
    await get().refreshBranches();
    if (checkout) {
      await Promise.all([get().refreshStatus(), get().resetHistory()]);
    }
  },

  resetHistory: async () => {
    set({ commits: [], historyExhausted: false });
    await get().loadMoreHistory();
  },

  loadMoreHistory: async () => {
    const repoPath = get().selectedRepo;
    if (!repoPath || get().historyExhausted) return;
    const skip = get().commits.length;
    const page = await api.getLog(repoPath, LOG_PAGE_SIZE, skip);
    set({
      commits: [...get().commits, ...page],
      historyExhausted: page.length < LOG_PAGE_SIZE,
    });
  },

  selectCommit: async (oid) => {
    set({
      selectedCommitOid: oid,
      selectedCommitFiles: [],
      selectedCommitFilePath: null,
      selectedCommitDiff: null,
    });
    const repoPath = get().selectedRepo;
    if (!repoPath || !oid) return;
    const files = await api.getCommitFiles(repoPath, oid);
    if (get().selectedCommitOid !== oid) return;
    set({ selectedCommitFiles: files });
    if (files.length > 0) await get().selectCommitFile(files[0][0]);
  },

  selectCommitFile: async (path) => {
    set({ selectedCommitFilePath: path });
    const repoPath = get().selectedRepo;
    const oid = get().selectedCommitOid;
    if (!repoPath || !oid || !path) {
      set({ selectedCommitDiff: null });
      return;
    }
    try {
      const diff = await api.getCommitFileDiff(repoPath, oid, path);
      if (get().selectedCommitFilePath === path) set({ selectedCommitDiff: diff });
    } catch {
      if (get().selectedCommitFilePath === path) set({ selectedCommitDiff: null });
    }
  },

  fetch: async () => {
    const repoPath = get().selectedRepo;
    if (!repoPath) return;
    await runSync(get, set, repoPath, () => api.gitFetch(repoPath));
    await Promise.all([get().refreshBranches(), get().refreshStatus(), get().refreshAheadBehind()]);
    void get().loadRepos();
  },
  pull: async () => {
    const repoPath = get().selectedRepo;
    if (!repoPath) return;
    await runSync(get, set, repoPath, () => api.gitPull(repoPath));
    await Promise.all([get().refreshStatus(), get().resetHistory(), get().refreshAheadBehind()]);
  },
  push: async () => {
    const repoPath = get().selectedRepo;
    if (!repoPath) return;
    await runSync(get, set, repoPath, () => api.gitPush(repoPath));
    await get().refreshAheadBehind();
  },

  addExistingRepo: async (path) => {
    const repos = await api.addRepo(path);
    set({ repos });
    await get().selectRepo(path);
  },
  cloneRepo: async (url, dest) => {
    await runSync(get, set, dest, () => api.gitClone(url, dest));
    const repos = await api.addRepo(dest);
    set({ repos });
    await get().selectRepo(dest);
  },
  createNewRepo: async (path) => {
    await api.initRepo(path);
    const repos = await api.addRepo(path);
    set({ repos });
    await get().selectRepo(path);
  },
  removeRepo: async (path) => {
    const repos = await api.removeRepo(path);
    set({ repos });
    if (get().selectedRepo === path) {
      set({ selectedRepo: null });
      if (repos.length > 0) await get().selectRepo(repos[0].path);
    }
  },
}));

async function runSync(
  get: () => RepoState,
  set: (partial: Partial<RepoState>) => void,
  eventId: string,
  action: () => Promise<void>,
) {
  set({ syncing: true, syncLog: [] });
  const unlisten = await listen<GitOutputLine>(`git://${eventId}`, (event) => {
    set({ syncLog: [...get().syncLog, event.payload] });
  });
  try {
    await action();
  } finally {
    unlisten();
    set({ syncing: false });
  }
}
