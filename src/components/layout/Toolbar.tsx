import { useState } from "react";
import { SettingsIcon } from "lucide-react";
import { useRepoStore } from "@/store/useRepoStore";
import { BranchSwitcher } from "@/components/repo/BranchSwitcher";
import { BranchPruner } from "@/components/repo/BranchPruner";
import { SyncButton } from "@/components/repo/SyncButton";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { Button } from "@/components/ui/button";

export function Toolbar() {
  const currentName = useRepoStore(
    (s) => s.repos.find((r) => r.path === s.selectedRepo)?.name,
  );
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-2">
      <span className="truncate px-1 text-sm font-medium">{currentName}</span>
      <BranchSwitcher />
      <BranchPruner />
      <div className="flex-1" />
      <SyncButton />
      <Button variant="ghost" size="icon" title="Settings" onClick={() => setSettingsOpen(true)}>
        <SettingsIcon className="size-4" />
      </Button>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </header>
  );
}
