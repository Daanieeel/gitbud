import { RepositorySwitcher } from "@/components/repo/RepositorySwitcher";
import { BranchSwitcher } from "@/components/repo/BranchSwitcher";
import { SyncButton } from "@/components/repo/SyncButton";

export function Toolbar() {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2">
      <RepositorySwitcher />
      <BranchSwitcher />
      <div className="flex-1" />
      <SyncButton />
    </header>
  );
}
