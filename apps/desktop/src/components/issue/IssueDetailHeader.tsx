import { CircleCheckIcon, CircleDotIcon, ExternalLinkIcon, PanelRightIcon } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@gitbud/ui/button";
import { Avatar } from "@gitbud/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gitbud/ui/tooltip";
import { useCloseIssue, useReopenIssue } from "@/hooks/queries/useIssueMeta";
import { useIssueStore } from "@/store/useIssueStore";
import type { Issue } from "@/lib/types";

interface IssueDetailHeaderProps {
  repoPath: string;
  login: string;
  issue: Issue;
}

export function IssueDetailHeader({ repoPath, login, issue }: IssueDetailHeaderProps) {
  const sidebarCollapsed = useIssueStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useIssueStore((s) => s.setSidebarCollapsed);
  const closeIssue = useCloseIssue(repoPath, login, issue.number);
  const reopenIssue = useReopenIssue(repoPath, login, issue.number);
  const isOpen = issue.state === "open";

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
      <Avatar src={issue.author_avatar_url} alt={issue.author_login} className="size-6" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-base font-medium">
          {issue.title} <span className="text-muted-foreground">#{issue.number}</span>
        </div>
        <div className="flex min-w-0 items-center gap-1.5 pt-1 text-xs text-muted-foreground">
          {isOpen ? (
            <CircleDotIcon className="size-3.5 shrink-0 text-accent-green" />
          ) : (
            <CircleCheckIcon className="size-3.5 shrink-0 text-accent-purple" />
          )}
          <span>{isOpen ? "Open" : "Closed"}</span>
        </div>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              void openUrl(issue.html_url);
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            <ExternalLinkIcon className="size-4" />
          </a>
        </TooltipTrigger>
        <TooltipContent>Open on GitHub</TooltipContent>
      </Tooltip>
      {isOpen ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="destructive"
              size="sm"
              disabled={closeIssue.isPending}
              onClick={() => closeIssue.mutate()}
            >
              <CircleCheckIcon className="size-3.5" />
              {closeIssue.isPending ? "Closing…" : "Close"}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Close this issue</TooltipContent>
        </Tooltip>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="positive"
              size="sm"
              disabled={reopenIssue.isPending}
              onClick={() => reopenIssue.mutate()}
            >
              <CircleDotIcon className="size-3.5" />
              {reopenIssue.isPending ? "Reopening…" : "Reopen"}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Reopen this issue</TooltipContent>
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
