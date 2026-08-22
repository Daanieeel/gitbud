import { useState } from "react";
import { GitPullRequestIcon } from "lucide-react";
import { useRepoStore } from "@/store/useRepoStore";
import { useGitHubStore } from "@/store/useGitHubStore";
import { BranchSwitcher } from "@/components/repo/BranchSwitcher";
import { BranchPruner } from "@/components/repo/BranchPruner";
import { TagsPanel } from "@/components/repo/TagsPanel";
import { SubmodulesPanel } from "@/components/repo/SubmodulesPanel";
import { WorktreesPanel } from "@/components/repo/WorktreesPanel";
import { ReflogPanel } from "@/components/history/ReflogPanel";
import { LfsPanel } from "@/components/repo/LfsPanel";
import { SyncButton } from "@/components/repo/SyncButton";
import { CreatePRDialog } from "@/components/pr/CreatePRDialog";
import { OfflineIndicator } from "./OfflineIndicator";
import { Button } from "@/components/ui/button";

export function Toolbar() {
  const currentName = useRepoStore(
    (s) => s.repos.find((r) => r.path === s.selectedRepo)?.name,
  );
  const currentLogin = useGitHubStore((s) => s.currentLogin);
  const [previewPrOpen, setPreviewPrOpen] = useState(false);

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 px-3">
      <span className="truncate px-1 text-sm font-medium">{currentName}</span>
      <BranchSwitcher />
      <BranchPruner />
      <TagsPanel />
      <SubmodulesPanel />
      <WorktreesPanel />
      <ReflogPanel />
      <LfsPanel />
      <div className="flex-1" />
      <OfflineIndicator />
      {currentLogin && (
        <Button
          variant="outline"
          size="sm"
          title="Preview and open a pull request for this branch"
          onClick={() => setPreviewPrOpen(true)}
        >
          <GitPullRequestIcon className="size-3.5" />
          Preview PR
        </Button>
      )}
      <SyncButton />
      <CreatePRDialog open={previewPrOpen} onOpenChange={setPreviewPrOpen} />
    </header>
  );
}
