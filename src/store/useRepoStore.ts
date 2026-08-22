import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { api } from "@/lib/tauri";
import { notify } from "@/lib/notify";
import { useNetworkStore } from "./useNetworkStore";
import { useStashStore } from "./useStashStore";
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
  selectedStagedDiff: FileDiff | null;
  selectedUnstagedDiff: FileDiff | null;
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

  // Which kind of identity can authenticate this repo's remote — resolved by checking whether
  // the remote parses as a GitHub owner/repo. Null while unresolved (right after switching
  // repos); callers that gate on this should treat null as "not yet known" and not block.
  remoteProvider: "github" | "other" | null;

  globalListenersReady: boolean;

  initGlobalListeners: () => Promise<void>;
  loadRepos: () => Promise<void>;
  selectRepo: (path: string) => Promise<void>;
  refreshStatus: () => Promise<void>;
  refreshBranches: () => Promise<void>;
  refreshAheadBehind: () => Promise<void>;
  refreshRemoteProvider: () => Promise<void>;
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
  pullLfs: () => Promise<void>;
  pushLfs: () => Promise<void>;

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
  selectedStagedDiff: null,
  selectedUnstagedDiff: null,
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

  aheadBehind: { ahead: 0, behind: 0, published: true },
  syncing: false,
  remoteProvider: null,

  globalListenersReady: false,

  initGlobalListeners: async () => {
    if (get().globalListenersReady) return;
    set({ globalListenersReady: true });
    await listen<string>("repo-changed", (event) => {
      if (event.payload === get().selectedRepo) {
        void get().refreshStatus();
        void useStashStore.getState().load(event.payload);
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
      selectedStagedDiff: null,
      selectedUnstagedDiff: null,
      selectedFileImageDiff: null,
      commits: [],
      historyExhausted: false,
      selectedCommitOid: null,
      selectedCommitFiles: [],
      selectedCommitFilePath: null,
      selectedCommitDiff: null,
      selectedCommitImageDiff: null,
      aheadBehind: { ahead: 0, behind: 0, published: true },
      remoteProvider: null,
    });

    await api.startWatch(path).catch(() => {});
    await Promise.all([
      get().refreshStatus(),
      get().refreshBranches(),
      get().loadMoreHistory(),
      get().refreshAheadBehind(),
      get().refreshRemoteProvider(),
      useStashStore.getState().load(path),
    ]);
  },

  refreshRemoteProvider: async () => {
    const repoPath = get().selectedRepo;
    if (!repoPath) return;
    const provider: "github" | "other" = await api
      .githubRemoteOwnerRepo(repoPath)
      .then((remote) => (remote ? "github" : "other"))
      .catch(() => "other");
    if (get().selectedRepo === repoPath) set({ remoteProvider: provider });
  },

  refreshStatus: async () => {
    const repoPath = get().selectedRepo;
    if (!repoPath) return;
    const status = await api.getStatus(repoPath);
    set({ status });

    const selected = get().selectedFilePath;
    if (selected && !status.files.some((f) => f.path === selected)) {
      set({ selectedFilePath: null, selectedStagedDiff: null, selectedUnstagedDiff: null, selectedFileImageDiff: null });
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
      if (get().selectedRepo === repoPath) set({ aheadBehind: { ahead: 0, behind: 0, published: true } });
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
      set({ selectedFilePath: null, selectedStagedDiff: null, selectedUnstagedDiff: null, selectedFileImageDiff: null });
    }
    await get().refreshStatus();
  },

  stageHunk: async (path, hunkIndex) => {
    const repoPath = get().selectedRepo;
    if (!repoPath) return;
    try {
      await api.stageHunk(repoPath, path, hunkIndex);
    } catch (err) {
      toast.error(String(err));
      return;
    }
    await get().refreshStatus();
  },

  unstageHunk: async (path, hunkIndex) => {
    const repoPath = get().selectedRepo;
    if (!repoPath) return;
    try {
      await api.unstageHunk(repoPath, path, hunkIndex);
    } catch (err) {
      toast.error(String(err));
      return;
    }
    await get().refreshStatus();
  },

  discardHunk: async (path, hunkIndex) => {
    const repoPath = get().selectedRepo;
    if (!repoPath) return;
    try {
      await api.discardHunk(repoPath, path, hunkIndex);
    } catch (err) {
      toast.error(String(err));
      return;
    }
    await get().refreshStatus();
  },

  selectFile: async (path) => {
    set({ selectedFilePath: path, selectedFileImageDiff: null });
    const repoPath = get().selectedRepo;
    if (!repoPath || !path) {
      set({ selectedStagedDiff: null, selectedUnstagedDiff: null });
      return;
    }
    try {
      const [staged, unstaged] = await Promise.all([
        api.getFileDiff(repoPath, path, true),
        api.getFileDiff(repoPath, path, false),
      ]);
      if (get().selectedFilePath !== path) return;
      set({ selectedStagedDiff: staged, selectedUnstagedDiff: unstaged });
      if (unstaged.is_image) {
        // Whole-file image diffs have no staged/unstaged hunk split to show side by side —
        // just show whichever side is actually fully staged.
        const entryStaged = get().status?.files.find((f) => f.path === path)?.staged ?? false;
        const imageDiff = await api.getImageDiff(repoPath, path, entryStaged);
        if (get().selectedFilePath === path) set({ selectedFileImageDiff: imageDiff });
      }
    } catch {
      if (get().selectedFilePath === path) set({ selectedStagedDiff: null, selectedUnstagedDiff: null });
    }
  },

  setCommitSummary: (value) => set({ commitSummary: value }),
  setCommitDescription: (value) => set({ commitDescription: value }),
  setAmending: (value) => set({ amending: value }),

  doCommit: async (summary, description) => {
    const repoPath = get().selectedRepo;
    if (!repoPath) return;
    const stagedCount = get().status?.files.filter((f) => f.staged).length ?? 0;
    const branch = get().branch ?? "current branch";
    await api.commit(repoPath, summary, description);
    set({
      selectedFilePath: null,
      selectedStagedDiff: null,
      selectedUnstagedDiff: null,
      selectedFileImageDiff: null,
      commitSummary: "",
      commitDescription: "",
    });
    await Promise.all([get().refreshStatus(), get().resetHistory()]);
    const fileWord = stagedCount === 1 ? "file" : "files";
    void notify(`Committed ${stagedCount} ${fileWord} to ${branch}`, summary);
  },

  doAmendCommit: async (summary, description) => {
    const repoPath = get().selectedRepo;
    if (!repoPath) return;
    const branch = get().branch ?? "current branch";
    await api.amendCommit(repoPath, summary, description);
    set({
      selectedFilePath: null,
      selectedStagedDiff: null,
      selectedUnstagedDiff: null,
      selectedFileImageDiff: null,
      commitSummary: "",
      commitDescription: "",
      amending: false,
    });
    await Promise.all([get().refreshStatus(), get().resetHistory()]);
    void notify(`Amended commit on ${branch}`, summary);
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
    await runSync(get, set, repoPath, () => api.gitFetch(repoPath), {
      description: "Fetching origin…",
      doneMessage: "Fetched origin",
    });
    await Promise.all([get().refreshBranches(), get().refreshStatus(), get().refreshAheadBehind()]);
    void get().loadRepos();
  },
  pull: async () => {
    const repoPath = get().selectedRepo;
    if (!repoPath) return;
    const branch = get().branch ?? "current branch";
    await runSync(get, set, repoPath, () => api.gitPull(repoPath), {
      description: `Pulling origin/${branch}…`,
      doneMessage: `Pulled origin/${branch}`,
    });
    await Promise.all([get().refreshStatus(), get().resetHistory(), get().refreshAheadBehind()]);
  },
  push: async () => {
    const repoPath = get().selectedRepo;
    if (!repoPath) return;
    const branch = get().branch ?? "current branch";
    const publish = !get().aheadBehind.published;
    await runSync(get, set, repoPath, () => api.gitPush(repoPath), {
      description: publish ? `Publishing ${branch} to origin…` : `Pushing ${branch} to origin…`,
      doneMessage: publish ? `Published ${branch} to origin` : `Pushed ${branch} to origin`,
    });
    await get().refreshAheadBehind();
  },
  pullLfs: async () => {
    const repoPath = get().selectedRepo;
    if (!repoPath) return;
    await runSync(get, set, repoPath, () => api.gitLfsPull(repoPath), {
      description: "Pulling LFS objects from origin…",
      doneMessage: "Pulled LFS objects from origin",
    });
  },
  pushLfs: async () => {
    const repoPath = get().selectedRepo;
    const branch = get().branch;
    if (!repoPath || !branch) return;
    await runSync(get, set, repoPath, () => api.gitLfsPush(repoPath, branch), {
      description: `Pushing LFS objects for ${branch} to origin…`,
      doneMessage: `Pushed LFS objects for ${branch} to origin`,
    });
  },

  addExistingRepo: async (path) => {
    const repos = await api.addRepo(path);
    set({ repos });
    await get().selectRepo(path);
  },
  cloneRepo: async (url, dest) => {
    await runSync(get, set, dest, () => api.gitClone(url, dest), {
      description: `Cloning ${url}…`,
      doneMessage: `Cloned ${url}`,
    });
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

const NOTIFY_THRESHOLD_MS = 4000;

// Backend has its own 45s no-output watchdog (git_shell.rs), but that only protects against
// git itself going quiet — not against a hung/unresponsive backend, a stale build missing
// that fix, or the IPC event just never arriving. This is the hard client-side backstop: no
// matter what, the UI recovers after this long and the underlying op is asked to cancel.
const SYNC_TIMEOUT_MS = 90_000;

// A button's disabled/spinning state tied directly to an async action can finish and flip
// back off faster than a human eye (or even a browser paint) reliably registers, which reads
// as "the loading state never showed, then flashed on after the fact" once the surrounding UI
// (label, ahead/behind counts, ...) updates a moment later. Holding `syncing` on for at least
// this long guarantees the loading state is actually visible before it clears.
const MIN_SYNCING_MS = 400;

async function runSync(
  get: () => RepoState,
  set: (partial: Partial<RepoState>) => void,
  eventId: string,
  action: () => Promise<void>,
  opts?: { description: string; doneMessage: string },
) {
  const startedAt = Date.now();
  set({ syncing: true });
  const label = opts?.description ?? "Working…";
  let resolveCancelled: () => void;
  const cancelled = new Promise<"cancelled">((resolve) => {
    resolveCancelled = () => resolve("cancelled");
  });
  const cancelAction = {
    label: "Cancel",
    onClick: () => {
      void api.cancelGitOperation(eventId).catch(() => {});
      resolveCancelled();
    },
  };
  toast.loading(label, { id: eventId, description: undefined, cancel: cancelAction });

  const unlisten = await listen<GitOutputLine>(`git://${eventId}`, (event) => {
    toast.loading(label, { id: eventId, description: event.payload.line, cancel: cancelAction });
  });
  try {
    const settled = action().then(
      () => ({ ok: true as const }),
      (err: unknown) => ({ ok: false as const, error: String(err) }),
    );
    const timedOut = new Promise<"timeout">((resolve) => {
      setTimeout(() => resolve("timeout"), SYNC_TIMEOUT_MS);
    });
    const outcome = await Promise.race([settled, timedOut, cancelled]);

    if (outcome === "cancelled") {
      toast(`${label.replace(/…$/, "")} cancelled`, { id: eventId });
      return;
    }
    if (outcome === "timeout") {
      void api.cancelGitOperation(eventId).catch(() => {});
      const message = `${label.replace(/…$/, "")} timed out after ${SYNC_TIMEOUT_MS / 1000}s with no response and was cancelled.`;
      toast.error(message, { id: eventId });
      useNetworkStore.getState().noteError(message);
      return;
    }
    if (!outcome.ok) {
      toast.error(outcome.error, { id: eventId });
      useNetworkStore.getState().noteError(outcome.error);
      return;
    }
    useNetworkStore.getState().noteSuccess();
    if (opts) {
      toast.success(opts.doneMessage, { id: eventId });
      if (Date.now() - startedAt > NOTIFY_THRESHOLD_MS) {
        const repoName = get().repos.find((r) => r.path === eventId)?.name ?? eventId;
        void notify(opts.doneMessage, repoName);
      }
    } else {
      toast.dismiss(eventId);
    }
  } finally {
    unlisten();
    const elapsed = Date.now() - startedAt;
    if (elapsed < MIN_SYNCING_MS) {
      await new Promise((resolve) => setTimeout(resolve, MIN_SYNCING_MS - elapsed));
    }
    set({ syncing: false });
  }
}
