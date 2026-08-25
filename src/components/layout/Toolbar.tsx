import { useState, useEffect } from "react";
import { GitPullRequestCreateArrow, GitPullRequestArrowIcon, ExternalLinkIcon, CodeIcon } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { useGitHubStore } from "@/store/useGitHubStore";
import { useRepoStore } from "@/store/useRepoStore";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useBranches } from "@/hooks/queries/useBranches";
import { useCommitLog } from "@/hooks/queries/useCommitLog";
import { usePullRequestList } from "@/hooks/queries/usePullRequests";
import { usePRStore } from "@/store/usePRStore";
import { api } from "@/lib/tauri";
import { detectRemoteProvider } from "@/lib/remote-provider";
import { CUSTOM_EDITOR_ID, findEditor } from "@/lib/editors";
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
  const branches = branchData?.branches ?? [];
  const hasOtherBranch = branches.some((b) => !b.is_remote && b.name !== branch);
  const { commits } = useCommitLog(repoPath);
  const hasCommits = commits.length > 0;
  const previewPrDisabledReason = !hasCommits
    ? "No commits yet"
    : !hasOtherBranch
      ? "No branch to open into"
      : null;
  const setActiveTab = useRepoStore((s) => s.setActiveTab);
  const selectPR = usePRStore((s) => s.selectPR);
  const setPRFilter = usePRStore((s) => s.setFilter);
  const [previewPrOpen, setPreviewPrOpen] = useState(false);
  // Shares the exact same cache useProviderSync keeps warm in the background and CreatePRDialog
  // invalidates on submit — this is what makes "Preview PR" flip to "View PR" both right after
  // creating one in-app and after a teammate opens one, without its own separate fetch.
  const { pulls: openPulls } = usePullRequestList(repoPath, currentLogin, "open");
  const existingPrNumber = openPulls.find((p) => p.head_ref === branch)?.number ?? null;
  const [remoteInfo, setRemoteInfo] = useState<{ url: string; provider: ReturnType<typeof detectRemoteProvider> } | null>(null);
  const favoriteEditorId = useSettingsStore((s) => s.settings.favorite_editor);
  const customEditorCommand = useSettingsStore((s) => s.settings.custom_editor_command);
  const favoriteEditorOption = findEditor(favoriteEditorId);
  const isCustomEditor = favoriteEditorId === CUSTOM_EDITOR_ID && !!customEditorCommand;

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
      {(favoriteEditorOption || isCustomEditor) && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (!repoPath || !favoriteEditorId) return;
                void api.openInEditor(repoPath, favoriteEditorId, customEditorCommand).catch((err) => toast.error(String(err)));
              }}
            >
              {favoriteEditorOption ? (
                <img
                  src={favoriteEditorOption.icon}
                  alt=""
                  className={favoriteEditorOption.id === "zed" ? "size-4" : "size-3.5"}
                />
              ) : (
                <CodeIcon className="size-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open in {favoriteEditorOption?.name ?? "Editor"}</TooltipContent>
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
                setPRFilter("open");
                selectPR(existingPrNumber);
                setActiveTab("pulls");
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
            {/* Not a real `disabled` attribute: a disabled element receives no pointer events
             * in most browsers, which would silently prevent the tooltip from showing. */}
            <Button
              variant="positive"
              size="sm"
              aria-disabled={previewPrDisabledReason != null}
              className={previewPrDisabledReason != null ? "cursor-not-allowed opacity-40" : undefined}
              onClick={() => previewPrDisabledReason == null && setPreviewPrOpen(true)}
            >
              <GitPullRequestCreateArrow className="size-3.5" />
              Preview PR
            </Button>
          </TooltipTrigger>
          <TooltipContent>{previewPrDisabledReason ?? "Preview and open a pull request for this branch"}</TooltipContent>
        </Tooltip>
      )}
      <SyncButton />
      <CreatePRDialog open={previewPrOpen} onOpenChange={setPreviewPrOpen} />
    </header>
  );
}
