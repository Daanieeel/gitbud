import { useState } from "react";
import {
  CheckCircle2Icon,
  ExternalLinkIcon,
  GitBranchIcon,
  GitMergeIcon,
  GitPullRequestArrowIcon,
  GitPullRequestClosedIcon,
  PanelRightIcon,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@gitbud/ui/button";
import { Avatar } from "@gitbud/ui/avatar";
import { BranchName } from "@gitbud/ui/branch-name";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gitbud/ui/tooltip";
import { CopyButton } from "@gitbud/ui/copy-button";
import { CIBadge } from "./CIBadge";
import { PRAddReviewButton } from "./PRAddReviewButton";
import { prPollIntervalMs, useIsPrTabActive } from "@/hooks/queries/useCheckRuns";
import { useClosePullRequest, useReopenPullRequest } from "@/hooks/queries/usePullRequestMeta";
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
  const closePr = useClosePullRequest(repoPath, login, pr.number);
  const reopenPr = useReopenPullRequest(repoPath, login, pr.number);
  const isOpen = !pr.merged && pr.state === "open";
  const isClosedNotMerged = !pr.merged && pr.state !== "open";

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
      {pr.merged && (
        <span className="flex shrink-0 items-center gap-1 rounded-md bg-accent-purple/15 px-2 py-1 text-xs font-medium text-accent-purple">
          <CheckCircle2Icon className="size-3.5 shrink-0" />
          Merged
        </span>
      )}
      <div className="flex items-center gap-3">
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
            <CopyButton
              value={pr.html_url}
              className="text-muted-foreground hover:text-foreground"
            />
          </TooltipTrigger>
          <TooltipContent>Copy link</TooltipContent>
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
          <TooltipContent>
            {`Fetch and check out as local branch `}
            <code>{`pr-${pr.number}`}</code>{" "}
          </TooltipContent>
        </Tooltip>
        {isOpen && (
          <PRAddReviewButton
            repoPath={repoPath}
            login={login}
            number={pr.number}
            isOwnPr={pr.author_login === login}
          />
        )}
        {isOpen && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="destructive"
                size="sm"
                disabled={closePr.isPending}
                onClick={() => closePr.mutate()}
              >
                <GitPullRequestClosedIcon className="size-3.5" />
                {closePr.isPending ? "Closing…" : "Close PR"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Close this pull request without merging</TooltipContent>
          </Tooltip>
        )}
        {isOpen && (
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
        {isClosedNotMerged && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="positive"
                size="sm"
                disabled={reopenPr.isPending}
                onClick={() => reopenPr.mutate()}
              >
                <GitPullRequestArrowIcon className="size-3.5" />
                {reopenPr.isPending ? "Reopening…" : "Reopen"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reopen this pull request</TooltipContent>
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
    </div>
  );
}
