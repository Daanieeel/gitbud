import { create } from "zustand";

export type PRFilter = "open" | "closed" | "all";
export type PRDetailTab = "conversation" | "commits" | "checks" | "files";

// Pure UI-selection state for the Pull Requests tab. The PR list, detail (files/comments), and
// mutations all live in TanStack Query now — see src/hooks/queries/usePullRequests.ts — this
// store only ever holds "what's picked".
interface PRState {
  filter: PRFilter;
  setFilter: (filter: PRFilter) => void;

  selectedNumber: number | null;
  selectedFilePath: string | null;
  selectPR: (number: number | null) => void;
  selectFile: (path: string | null) => void;

  activeTab: PRDetailTab;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  /** Switching to Files auto-collapses the sidebar every time (not sticky across visits) to
   * give the file list + diff full width, since that's this app's heaviest-use view. */
  setActiveTab: (tab: PRDetailTab) => void;

  /** Set by clicking a commit sha anywhere outside the Commits tab itself (e.g. the
   * Conversation timeline's commit-pushed rows) — jumps to the Commits tab with that commit
   * already selected. `CommitsTab` reads this once then manages its own selection locally from
   * then on, same as it always has. */
  selectedCommitSha: string | null;
  selectCommit: (sha: string) => void;
  clearSelectedCommit: () => void;

  /** Text queued by a timeline comment's "Quote reply" action — `PRCommentCompose` picks this up
   * (prefixing it as a markdown quote) and clears it once consumed, rather than the two
   * components needing a direct reference to each other. */
  quotedReplyText: string | null;
  setQuotedReply: (text: string) => void;
  clearQuotedReply: () => void;
}

export const usePRStore = create<PRState>((set) => ({
  filter: "open",
  setFilter: (filter) => set({ filter }),

  selectedNumber: null,
  selectedFilePath: null,
  selectPR: (number) =>
    set({
      selectedNumber: number,
      selectedFilePath: null,
      activeTab: "conversation",
      selectedCommitSha: null,
      quotedReplyText: null,
    }),
  selectFile: (path) => set({ selectedFilePath: path }),

  activeTab: "conversation",
  sidebarCollapsed: false,
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setActiveTab: (tab) => set({ activeTab: tab, sidebarCollapsed: tab === "files" }),

  selectedCommitSha: null,
  selectCommit: (sha) => set({ selectedCommitSha: sha, activeTab: "commits" }),
  clearSelectedCommit: () => set({ selectedCommitSha: null }),

  quotedReplyText: null,
  setQuotedReply: (text) => set({ quotedReplyText: text, activeTab: "conversation" }),
  clearQuotedReply: () => set({ quotedReplyText: null }),
}));
