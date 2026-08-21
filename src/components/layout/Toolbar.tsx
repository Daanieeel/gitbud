import { useRepoStore } from "@/store/useRepoStore";
import { BranchSwitcher } from "@/components/repo/BranchSwitcher";
import { SyncButton } from "@/components/repo/SyncButton";

export function Toolbar() {
  const currentName = useRepoStore(
    (s) => s.repos.find((r) => r.path === s.selectedRepo)?.name,
  );

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2">
      <span className="truncate px-1 text-sm font-medium">{currentName}</span>
      <BranchSwitcher />
      <div className="flex-1" />
      <SyncButton />
    </header>
  );
}
