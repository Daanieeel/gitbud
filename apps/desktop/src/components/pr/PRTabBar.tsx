import { cn } from "@gitbud/ui/utils";
import { usePRStore, type PRDetailTab } from "@/store/usePRStore";

interface PRTabBarProps {
  filesCount: number;
  commitsCount: number;
  checksCount: number;
}

const TABS: { key: PRDetailTab; label: (counts: PRTabBarProps) => string }[] = [
  { key: "conversation", label: () => "Conversation" },
  {
    key: "commits",
    label: (c) => (c.commitsCount > 0 ? `Commits (${c.commitsCount})` : "Commits"),
  },
  { key: "checks", label: (c) => (c.checksCount > 0 ? `Checks (${c.checksCount})` : "Checks") },
  { key: "files", label: (c) => (c.filesCount > 0 ? `Files (${c.filesCount})` : "Files") },
];

export function PRTabBar(props: PRTabBarProps) {
  const activeTab = usePRStore((s) => s.activeTab);
  const setActiveTab = usePRStore((s) => s.setActiveTab);

  return (
    <div className="flex shrink-0 gap-1 border-b border-border px-2 text-sm">
      {TABS.map((tab) => (
        <button
          key={tab.key}
          onClick={() => setActiveTab(tab.key)}
          className={cn(
            "border-b-2 px-2 py-1.5 text-muted-foreground hover:text-foreground",
            activeTab === tab.key ? "border-primary text-foreground" : "border-transparent",
          )}
        >
          {tab.label(props)}
        </button>
      ))}
    </div>
  );
}
