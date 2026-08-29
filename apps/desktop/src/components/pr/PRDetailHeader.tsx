import { useState } from "react";
import { ExternalLinkIcon, GitBranchIcon, GitMergeIcon, PanelRightIcon } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@gitbud/ui/button";
import { Avatar } from "@gitbud/ui/avatar";
import { BranchName } from "@gitbud/ui/branch-name";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gitbud/ui/tooltip";
import { CIBadge } from "./CIBadge";
import { prPollIntervalMs, useIsPrTabActive } from "@/hooks/queries/useCheckRuns";
import { usePRStore } from "@/store/usePRStore";
import { api } from "@/lib/tauri";
import type { PullRequest } from "@/lib/types";

interface PRDetailHeaderProps {
  repoPath: string;
  login: string;
  pr: PullRequest;
  onMergeClick: () => void;
}

export function PRDetailHeader({ repoPath, login, pr, onMergeClick }: PRDetailHeaderProps) {
  const [checkingOut, setCheckingOut] = useState(false);
  const isPrTabActive = useIsPrTabActive();
  const sidebarCollapsed = usePRStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = usePRStore((s) => s.setSidebarCollapsed);

  const checkout = async () => {
    setCheckingOut(true);
    try {
      await api.checkoutPullRequest(repoPath, pr.number);
    } finally {
      setCheckingOut(false);
    }
  };

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
      <Avatar src={pr.author_avatar_url} alt={pr.author_login} className="size-6" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-base font-medium">
          {pr.title} <span className="text-muted-foreground">#{pr.number}</span>
        </div>
        <div className="flex min-w-0 items-center gap-1.5 pt-2 text-xs text-muted-foreground">
          <BranchName className="h-5 px-1.5 text-xs">{pr.base_ref}</BranchName>
          <span className="shrink-0">←</span>
          <BranchName className="h-5 px-1.5 text-xs">{pr.head_ref}</BranchName>
        </div>
      </div>
      <CIBadge
        repoPath={repoPath}
        login={login}
        sha={pr.head_sha}
        pollIntervalMs={prPollIntervalMs(pr, isPrTabActive, true)}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              void openUrl(pr.html_url);
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            <ExternalLinkIcon className="size-4" />
          </a>
        </TooltipTrigger>
        <TooltipContent>Open on GitHub</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            disabled={checkingOut}
            onClick={() => void checkout()}
          >
            <GitBranchIcon className="size-3.5" />
            {checkingOut ? "Checking out…" : "Checkout"}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{`Fetch and check out as local branch pr-${pr.number}`}</TooltipContent>
      </Tooltip>
      {!pr.merged && pr.state === "open" && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" onClick={onMergeClick}>
              <GitMergeIcon className="size-3.5" />
              Merge…
            </Button>
          </TooltipTrigger>
          <TooltipContent>Merge this pull request</TooltipContent>
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="text-muted-foreground"
          >
            <PanelRightIcon className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {sidebarCollapsed ? "Show details panel" : "Hide details panel"}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
