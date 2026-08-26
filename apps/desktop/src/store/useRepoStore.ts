import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { api } from "@/lib/tauri";
import { queryClient } from "@/lib/queryClient";
import { queryKeys } from "@/lib/queryKeys";
import { runGitSync } from "@/lib/gitSync";
import { clearAutoStagedPaths } from "@/hooks/queries/useRepoStatus";
import type { RepoEntry } from "@/lib/types";

/** Restores the last-open repo across app restarts, so launching GitBud doesn't always land
 * back on whatever repo happens to be first in the sidebar. */
const LAST_REPO_KEY = "last-selected-repo";

interface RepoState {
  repos: RepoEntry[];
  selectedRepo: string | null;

  // UI-only selection state. The data these select INTO (status, diffs, commit files, ...) all
  // lives in TanStack Query, keyed off (selectedRepo, ...this selection) — see
  // src/hooks/queries/*. This store only ever holds "what's picked", never fetched data.
  selectedFilePath: string | null;
  selectedCommitOid: string | null;
  selectedCommitFilePath: string | null;

  // Lives here (not as local component state) so it survives switching away from the Changes
  // tab and back — CommitBox unmounts on tab switch, local state wouldn't.
  commitSummary: string;
  commitDescription: string;
  amending: boolean;

  activeTab: "changes" | "history" | "pulls";

  globalListenersReady: boolean;

  initGlobalListeners: () => Promise<void>;
  loadRepos: () => Promise<void>;
  selectRepo: (path: string) => Promise<void>;
  setActiveTab: (tab: "changes" | "history" | "pulls") => void;

  selectFile: (path: string | null) => void;
  setCommitSummary: (value: string) => void;
  setCommitDescription: (value: string) => void;
  setAmending: (value: boolean) => void;

  selectCommit: (oid: string | null) => void;
  selectCommitFile: (path: string | null) => void;

  addExistingRepo: (path: string) => Promise<void>;
  cloneRepo: (url: string, dest: string) => Promise<void>;
  createNewRepo: (path: string) => Promise<void>;
  removeRepo: (path: string) => Promise<void>;
}

/** Every query keyed off this repo path — status, branches, log, stashes, tags, worktrees, etc.
 * `invalidateQueries` matches by prefix, so this one call is the fs-watcher's entire refresh
 * list; no hand-maintained "everything that could have changed" chain to keep in sync. */
function invalidateRepo(repoPath: string) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.repo(repoPath) });
}

/** Warms the caches a newly-selected repo's UI reads from immediately, so switching repos
 * doesn't show a blank/loading flash for data that's cheap to have ready up front. */
function prefetchRepo(repoPath: string) {
  return Promise.all([
    queryClient.prefetchQuery({
      queryKey: queryKeys.status(repoPath),
      queryFn: () => api.getStatus(repoPath),
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.branches(repoPath),
      queryFn: async () => ({
        branch: await api.getCurrentBranch(repoPath),
        branches: await api.listBranches(repoPath),
      }),
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.aheadBehind(repoPath),
      queryFn: () =>
        api
          .getAheadBehind(repoPath)
          .catch(() => ({ ahead: 0, behind: 0, published: true, head_on_remote: true })),
    }),
    queryClient.prefetchQuery({
      queryKey: queryKeys.stashes(repoPath),
      queryFn: () => api.listStashes(repoPath),
    }),
    queryClient.prefetchInfiniteQuery({
      queryKey: queryKeys.log(repoPath),
      queryFn: ({ pageParam }: { pageParam: number }) => api.getLog(repoPath, 100, pageParam),
      initialPageParam: 0,
    }),
  ]);
}

export const useRepoStore = create<RepoState>((set, get) => ({
  repos: [],
  selectedRepo: null,

  selectedFilePath: null,
  selectedCommitOid: null,
  selectedCommitFilePath: null,

  commitSummary: "",
  commitDescription: "",
  amending: false,

  activeTab: "changes",

  globalListenersReady: false,

  initGlobalListeners: async () => {
    if (get().globalListenersReady) return;
    set({ globalListenersReady: true });
    await listen<string>("repo-changed", (event) => {
      if (event.payload === get().selectedRepo) invalidateRepo(event.payload);
    });
  },

  loadRepos: async () => {
    const repos = await api.loadRepos();
    set({ repos });
    if (!get().selectedRepo && repos.length > 0) {
      const lastPath = window.localStorage.getItem(LAST_REPO_KEY);
      const last = lastPath ? repos.find((r) => r.path === lastPath) : undefined;
      await get().selectRepo((last ?? repos[0]).path);
    }
  },

  selectRepo: async (path) => {
    const prev = get().selectedRepo;
    if (prev === path) return;
    if (prev) await api.stopWatch(prev).catch(() => {});
    window.localStorage.setItem(LAST_REPO_KEY, path);

    set({
      selectedRepo: path,
      selectedFilePath: null,
      selectedCommitOid: null,
      selectedCommitFilePath: null,
    });

    await api.startWatch(path).catch(() => {});
    await prefetchRepo(path);
  },

  setActiveTab: (tab) => set({ activeTab: tab }),

  selectFile: (path) => set({ selectedFilePath: path }),

  setCommitSummary: (value) => set({ commitSummary: value }),
  setCommitDescription: (value) => set({ commitDescription: value }),
  setAmending: (value) => set({ amending: value }),

  selectCommit: (oid) => set({ selectedCommitOid: oid, selectedCommitFilePath: null }),
  selectCommitFile: (path) => set({ selectedCommitFilePath: path }),

  addExistingRepo: async (path) => {
    const repos = await api.addRepo(path);
    set({ repos });
    await get().selectRepo(path);
  },
  cloneRepo: async (url, dest) => {
    await runGitSync(dest, () => api.gitClone(url, dest), {
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
    // Switch away from the removed repo BEFORE evicting its query cache: removeQueries on a
    // still-actively-observed key transiently clears its data out from under whatever's reading
    // it. Reassigning `selectedRepo` first unsubscribes those observers.
    if (get().selectedRepo === path) {
      set({ selectedRepo: null });
      if (repos.length > 0) await get().selectRepo(repos[0].path);
    }
    queryClient.removeQueries({ queryKey: queryKeys.repo(path) });
    clearAutoStagedPaths(path);
  },
}));
