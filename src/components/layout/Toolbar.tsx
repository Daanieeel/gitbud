import { useState, useEffect } from "react";
import { GitPullRequestCreateArrow, GitPullRequestArrowIcon, ExternalLinkIcon } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useGitHubStore } from "@/store/useGitHubStore";
import { useRepoStore } from "@/store/useRepoStore";
import { useBranches } from "@/hooks/queries/useBranches";
import { usePRStore } from "@/store/usePRStore";
import { api } from "@/lib/tauri";
import { detectRemoteProvider } from "@/lib/remote-provider";
import { GitHubMark } from "@/components/github/GitHubMark";
import { GitLabMark } from "@/components/github/GitLabMark";
import { BitbucketMark } from "@/components/github/BitbucketMark";
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
  const { data: branchData } = useBranches(repoPath);
  const branch = branchData?.branch ?? null;
  const setActiveTab = useRepoStore((s) => s.setActiveTab);
  const selectPR = usePRStore((s) => s.selectPR);
  const [previewPrOpen, setPreviewPrOpen] = useState(false);
  const [existingPrNumber, setExistingPrNumber] = useState<number | null>(null);
  const [remoteInfo, setRemoteInfo] = useState<{ url: string; provider: ReturnType<typeof detectRemoteProvider> } | null>(null);

  useEffect(() => {
    setRemoteInfo(null);
    if (!repoPath) return;
    let cancelled = false;
    void api.remoteWebInfo(repoPath).then((info) => {
      if (cancelled || !info) return;
      const [host, url] = info;
      setRemoteInfo({ url, provider: detectRemoteProvider(host) });
    });
    return () => {
      cancelled = true;
    };
  }, [repoPath]);

  useEffect(() => {
    const handleOpenCreatePr = () => setPreviewPrOpen(true);
    window.addEventListener("open-create-pr", handleOpenCreatePr);
    return () => window.removeEventListener("open-create-pr", handleOpenCreatePr);
  }, []);

  useEffect(() => {
    setExistingPrNumber(null);
    if (!repoPath || !currentLogin || !branch) return;
    let cancelled = false;
    void api.githubListPullRequests(repoPath, currentLogin, "open", 1).then((pulls) => {
      if (cancelled) return;
      const match = pulls.find((p) => p.head_ref === branch);
      setExistingPrNumber(match?.number ?? null);
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
      {remoteInfo && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" onClick={() => void openUrl(remoteInfo.url)}>
              {remoteInfo.provider === "github" && <GitHubMark className="size-3.5" />}
              {remoteInfo.provider === "gitlab" && <GitLabMark className="size-3.5" />}
              {remoteInfo.provider === "bitbucket" && <BitbucketMark className="size-3.5" />}
              {remoteInfo.provider === "unknown" && <ExternalLinkIcon className="size-3.5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>View repo on remote</TooltipContent>
        </Tooltip>
      )}
      <div className="flex-1" />
      <OfflineIndicator />
      {currentLogin && existingPrNumber != null && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="caution"
              size="sm"
              onClick={() => {
                if (!repoPath) return;
                setActiveTab("pulls");
                selectPR(existingPrNumber);
              }}
            >
              <GitPullRequestArrowIcon className="size-3.5" />
              View PR
            </Button>
          </TooltipTrigger>
          <TooltipContent>View the existing pull request for this branch</TooltipContent>
        </Tooltip>
      )}
      {currentLogin && existingPrNumber == null && (
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
