import { create } from "zustand";

export type IssueFilter = "open" | "closed" | "all";

// Pure UI-selection state for the Issues tab — mirrors usePRStore.ts, minus everything
// PR-diff-specific (no detail sub-tab, no selected file/commit) since an issue has one detail
// view and no diffs/commits of its own.
interface IssueState {
  filter: IssueFilter;
  setFilter: (filter: IssueFilter) => void;

  selectedNumber: number | null;
  selectIssue: (number: number | null) => void;

  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;

  /** Text queued by a timeline comment's "Quote reply" action — mirrors `usePRStore`'s field of
   * the same name, shared by the same `TimelineCommentMenu`/`PRCommentCompose` components. */
  quotedReplyText: string | null;
  setQuotedReply: (text: string) => void;
  clearQuotedReply: () => void;
}

export const useIssueStore = create<IssueState>((set) => ({
  filter: "open",
  setFilter: (filter) => set({ filter }),

  selectedNumber: null,
  selectIssue: (number) => set({ selectedNumber: number, quotedReplyText: null }),

  sidebarCollapsed: false,
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

  quotedReplyText: null,
  setQuotedReply: (text) => set({ quotedReplyText: text }),
  clearQuotedReply: () => set({ quotedReplyText: null }),
}));
