import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { api } from "@/lib/tauri";
import { pushRecentCommitMessage } from "@/lib/commit-history";
import type {
  AheadBehind,
  BranchInfo,
  CherryPickResult,
  CommitEntry,
  FileDiff,
  GitOutputLine,
  ImageDiff,
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
  selectedFileImageDiff: ImageDiff | null;

  // Lives here (not as local component state) so it survives switching away from the
  // Changes tab and back — CommitBox unmounts on tab switch, local state wouldn't.
  commitSummary: string;
  commitDescription: string;
  amending: boolean;

  activeTab: "changes" | "history" | "pulls";

  commits: CommitEntry[];
  historyExhausted: boolean;
  selectedCommitOid: string | null;
  selectedCommitFiles: [string, string][];
  selectedCommitFilePath: string | null;
  selectedCommitDiff: FileDiff | null;
  selectedCommitImageDiff: ImageDiff | null;

  aheadBehind: AheadBehind;
  syncing: boolean;
  syncLog: GitOutputLine[];
  syncError: string | null;
  syncEventId: string | null;

  globalListenersReady: boolean;

  initGlobalListeners: () => Promise<void>;
  loadRepos: () => Promise<void>;
  selectRepo: (path: string) => Promise<void>;
  refreshStatus: () => Promise<void>;
  refreshBranches: () => Promise<void>;
  refreshAheadBehind: () => Promise<void>;
  setActiveTab: (tab: "changes" | "history" | "pulls") => void;

  toggleStaged: (paths: string[], staged: boolean) => Promise<void>;
  discardFile: (path: string) => Promise<void>;
  stageHunk: (path: string, hunkIndex: number) => Promise<void>;
  unstageHunk: (path: string, hunkIndex: number) => Promise<void>;
  discardHunk: (path: string, hunkIndex: number) => Promise<void>;
  selectFile: (path: string | null) => Promise<void>;
  doCommit: (summary: string, description: string) => Promise<void>;
  doAmendCommit: (summary: string, description: string) => Promise<void>;
  setCommitSummary: (value: string) => void;
  setCommitDescription: (value: string) => void;
  setAmending: (value: boolean) => void;

  checkoutBranch: (branch: string) => Promise<void>;
  createBranch: (name: string, checkout: boolean) => Promise<void>;
  deleteBranch: (name: string) => Promise<void>;
  renameBranch: (oldName: string, newName: string) => Promise<void>;
  mergeBranch: (name: string) => Promise<CherryPickResult>;
  cherryPick: (oid: string) => Promise<CherryPickResult>;
  revertCommit: (oid: string) => Promise<CherryPickResult>;

  resetHistory: () => Promise<void>;
  loadMoreHistory: () => Promise<void>;
  selectCommit: (oid: string | null) => Promise<void>;
  selectCommitFile: (path: string | null) => Promise<void>;

  fetch: () => Promise<void>;
  pull: () => Promise<void>;
  push: () => Promise<void>;
  cancelSync: () => Promise<void>;

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
  selectedFileImageDiff: null,

  commitSummary: "",
  commitDescription: "",
  amending: false,

  activeTab: "changes",

  commits: [],
  historyExhausted: false,
  selectedCommitOid: null,
  selectedCommitFiles: [],
  selectedCommitFilePath: null,
  selectedCommitDiff: null,
  selectedCommitImageDiff: null,

  aheadBehind: { ahead: 0, behind: 0 },
  syncing: false,
  syncLog: [],
  syncError: null,
  syncEventId: null,

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
      selectedFileImageDiff: null,
      commits: [],
      historyExhausted: false,
      selectedCommitOid: null,
      selectedCommitFiles: [],
      selectedCommitFilePath: null,
      selectedCommitDiff: null,
      selectedCommitImageDiff: null,
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
      set({ selectedFilePath: null, selectedFileDiff: null, selectedFileImageDiff: null });
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

  discardFile: async (path) => {
    const repoPath = get().selectedRepo;
    if (!repoPath) return;
    await api.discardFile(repoPath, path);
    if (get().selectedFilePath === path) {
      set({ selectedFilePath: null, selectedFileDiff: null, selectedFileImageDiff: null });
    }
    await get().refreshStatus();
  },

  stageHunk: async (path, hunkIndex) => {
    const repoPath = get().selectedRepo;
    if (!repoPath) return;
    await api.stageHunk(repoPath, path, hunkIndex);
    await get().refreshStatus();
  },

  unstageHunk: async (path, hunkIndex) => {
    const repoPath = get().selectedRepo;
    if (!repoPath) return;
    await api.unstageHunk(repoPath, path, hunkIndex);
    await get().refreshStatus();
  },

  discardHunk: async (path, hunkIndex) => {
    const repoPath = get().selectedRepo;
    if (!repoPath) return;
    await api.discardHunk(repoPath, path, hunkIndex);
    await get().refreshStatus();
  },

  selectFile: async (path) => {
    set({ selectedFilePath: path, selectedFileImageDiff: null });
    const repoPath = get().selectedRepo;
    if (!repoPath || !path) {
      set({ selectedFileDiff: null });
      return;
    }
    const entry = get().status?.files.find((f) => f.path === path);
    const staged = entry?.staged ?? false;
    try {
      const diff = await api.getFileDiff(repoPath, path, staged);
      if (get().selectedFilePath !== path) return;
      set({ selectedFileDiff: diff });
      if (diff.is_image) {
        const imageDiff = await api.getImageDiff(repoPath, path, staged);
        if (get().selectedFilePath === path) set({ selectedFileImageDiff: imageDiff });
      }
    } catch {
      if (get().selectedFilePath === path) set({ selectedFileDiff: null });
    }
  },

  setCommitSummary: (value) => set({ commitSummary: value }),
  setCommitDescription: (value) => set({ commitDescription: value }),
  setAmending: (value) => set({ amending: value }),

  doCommit: async (summary, description) => {
    const repoPath = get().selectedRepo;
    if (!repoPath) return;
    await api.commit(repoPath, summary, description);
    pushRecentCommitMessage(summary);
    set({
      selectedFilePath: null,
      selectedFileDiff: null,
      selectedFileImageDiff: null,
      commitSummary: "",
      commitDescription: "",
    });
    await Promise.all([get().refreshStatus(), get().resetHistory()]);
  },

  doAmendCommit: async (summary, description) => {
    const repoPath = get().selectedRepo;
    if (!repoPath) return;
    await api.amendCommit(repoPath, summary, description);
    pushRecentCommitMessage(summary);
    set({
      selectedFilePath: null,
      selectedFileDiff: null,
      selectedFileImageDiff: null,
      commitSummary: "",
      commitDescription: "",
      amending: false,
    });
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

  deleteBranch: async (name) => {
    const repoPath = get().selectedRepo;
    if (!repoPath) return;
    await api.deleteBranch(repoPath, name);
    await get().refreshBranches();
  },

  renameBranch: async (oldName, newName) => {
    const repoPath = get().selectedRepo;
    if (!repoPath) return;
    await api.renameBranch(repoPath, oldName, newName);
    await get().refreshBranches();
  },

  mergeBranch: async (name) => {
    const repoPath = get().selectedRepo;
    if (!repoPath) return { conflicted: false, new_oid: null } satisfies CherryPickResult;
    const result = await api.mergeBranch(repoPath, name);
    await Promise.all([get().refreshStatus(), get().resetHistory(), get().refreshBranches()]);
    return result;
  },

  cherryPick: async (oid) => {
    const repoPath = get().selectedRepo;
    if (!repoPath) return { conflicted: false, new_oid: null } satisfies CherryPickResult;
    const result = await api.cherryPick(repoPath, oid);
    await Promise.all([get().refreshStatus(), get().resetHistory()]);
    return result;
  },

  revertCommit: async (oid) => {
    const repoPath = get().selectedRepo;
    if (!repoPath) return { conflicted: false, new_oid: null } satisfies CherryPickResult;
    const result = await api.revertCommit(repoPath, oid);
    await Promise.all([get().refreshStatus(), get().resetHistory()]);
    return result;
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
      selectedCommitImageDiff: null,
    });
    const repoPath = get().selectedRepo;
    if (!repoPath || !oid) return;
    const files = await api.getCommitFiles(repoPath, oid);
    if (get().selectedCommitOid !== oid) return;
    set({ selectedCommitFiles: files });
    if (files.length > 0) await get().selectCommitFile(files[0][0]);
  },

  selectCommitFile: async (path) => {
    set({ selectedCommitFilePath: path, selectedCommitImageDiff: null });
    const repoPath = get().selectedRepo;
    const oid = get().selectedCommitOid;
    if (!repoPath || !oid || !path) {
      set({ selectedCommitDiff: null });
      return;
    }
    try {
      const diff = await api.getCommitFileDiff(repoPath, oid, path);
      if (get().selectedCommitFilePath !== path) return;
      set({ selectedCommitDiff: diff });
      if (diff.is_image) {
        const imageDiff = await api.getCommitImageDiff(repoPath, oid, path);
        if (get().selectedCommitFilePath === path) set({ selectedCommitImageDiff: imageDiff });
      }
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
  cancelSync: async () => {
    const eventId = get().syncEventId;
    if (!eventId) return;
    await api.cancelGitOperation(eventId);
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
  set({ syncing: true, syncLog: [], syncError: null, syncEventId: eventId });
  const unlisten = await listen<GitOutputLine>(`git://${eventId}`, (event) => {
    set({ syncLog: [...get().syncLog, event.payload] });
  });
  try {
    await action();
  } catch (e) {
    set({ syncError: String(e) });
  } finally {
    unlisten();
    set({ syncing: false, syncEventId: null });
  }
}
