import { useRepoStore } from "@/store/useRepoStore";
import { cn } from "@/lib/utils";

export function TabBar() {
  const activeTab = useRepoStore((s) => s.activeTab);
  const setActiveTab = useRepoStore((s) => s.setActiveTab);

  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border px-2">
      {(["changes", "history"] as const).map((tab) => (
        <button
          key={tab}
          onClick={() => setActiveTab(tab)}
          className={cn(
            "rounded-md px-3 py-1 text-sm capitalize hover:bg-accent",
            activeTab === tab && "bg-accent font-medium",
          )}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
