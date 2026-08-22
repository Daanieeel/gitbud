import { useRepoStore } from "@/store/useRepoStore";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "changes", label: "Changes", hint: "Staged/unstaged files and diffs" },
  { key: "history", label: "History", hint: "Commit log and graph" },
  { key: "pulls", label: "Pull Requests", hint: "Open, closed, and merged pull requests" },
] as const;

export function TabBar() {
  const activeTab = useRepoStore((s) => s.activeTab);
  const setActiveTab = useRepoStore((s) => s.setActiveTab);

  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border px-2">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          title={tab.hint}
          onClick={() => setActiveTab(tab.key)}
          className={cn(
            "rounded-md px-3 py-1 text-sm hover:bg-accent",
            activeTab === tab.key && "bg-accent font-medium",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
