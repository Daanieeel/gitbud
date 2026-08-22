import { useState } from "react";
import { GitPullRequestIcon } from "lucide-react";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function Toolbar() {
  const currentLogin = useGitHubStore((s) => s.currentLogin);
  const [previewPrOpen, setPreviewPrOpen] = useState(false);

  return (
    <header className="flex shrink-0 items-center gap-2 p-2">
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
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPreviewPrOpen(true)}
            >
              <GitPullRequestIcon className="size-3.5" />
              Preview PR
            </Button>
          </TooltipTrigger>
          <TooltipContent>Preview and open a pull request for this branch</TooltipContent>
        </Tooltip>
      )}
      <SyncButton />
      <CreatePRDialog open={previewPrOpen} onOpenChange={setPreviewPrOpen} />
    </header>
  );
}
