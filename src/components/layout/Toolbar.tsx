import { useState, useEffect } from "react";
import { GitPullRequestCreateArrow, GitPullRequestArrowIcon } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useGitHubStore } from "@/store/useGitHubStore";
import { useRepoStore } from "@/store/useRepoStore";
import { api } from "@/lib/tauri";
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
  const repoPath = useRepoStore((s) => s.selectedRepo);
  const branch = useRepoStore((s) => s.branch);
  const [previewPrOpen, setPreviewPrOpen] = useState(false);
  const [existingPrUrl, setExistingPrUrl] = useState<string | null>(null);

  useEffect(() => {
    const handleOpenCreatePr = () => setPreviewPrOpen(true);
    window.addEventListener("open-create-pr", handleOpenCreatePr);
    return () => window.removeEventListener("open-create-pr", handleOpenCreatePr);
  }, []);

  useEffect(() => {
    setExistingPrUrl(null);
    if (!repoPath || !currentLogin || !branch) return;
    let cancelled = false;
    void api.githubListPullRequests(repoPath, currentLogin, "open", 1).then((pulls) => {
      if (cancelled) return;
      const match = pulls.find((p) => p.head_ref === branch);
      setExistingPrUrl(match?.html_url ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [repoPath, currentLogin, branch]);

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
      {currentLogin && existingPrUrl && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="positive" size="sm" onClick={() => void openUrl(existingPrUrl)}>
              <GitPullRequestArrowIcon className="size-3.5" />
              Open PR
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open the existing pull request for this branch</TooltipContent>
        </Tooltip>
      )}
      {currentLogin && !existingPrUrl && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="positive"
              size="sm"
              onClick={() => setPreviewPrOpen(true)}
            >
              <GitPullRequestCreateArrow className="size-3.5" />
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
