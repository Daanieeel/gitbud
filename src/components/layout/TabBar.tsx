import { FileDiffIcon, GitPullRequestIcon, HistoryIcon } from "lucide-react";
import { useRepoStore } from "@/store/useRepoStore";
import { StashPanel } from "@/components/changes/StashPanel";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "changes", label: "Changes", hint: "Staged/unstaged files and diffs", icon: FileDiffIcon },
  { key: "history", label: "History", hint: "Commit log and graph", icon: HistoryIcon },
  {
    key: "pulls",
    label: "Pull Requests",
    hint: "Open, closed, and merged pull requests",
    icon: GitPullRequestIcon,
  },
] as const;

export function TabBar() {
  const activeTab = useRepoStore((s) => s.activeTab);
  const setActiveTab = useRepoStore((s) => s.setActiveTab);
  const hasChanges = useRepoStore((s) => (s.status?.files.length ?? 0) > 0);

  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 pt-2 pb-1.5">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          title={tab.hint}
          onClick={() => setActiveTab(tab.key)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1 text-sm hover:bg-accent",
            activeTab === tab.key && "bg-accent font-medium",
          )}
        >
          <tab.icon className="size-3.5" />
          {tab.label}
        </button>
      ))}
      <div className="flex-1" />
      <StashPanel hasChanges={hasChanges} />
    </div>
  );
}
