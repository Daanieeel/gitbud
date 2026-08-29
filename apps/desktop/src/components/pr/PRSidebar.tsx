import { PRSidebarReviewers } from "./PRSidebarReviewers";
import { PRSidebarAssignees } from "./PRSidebarAssignees";
import { PRSidebarLabels } from "./PRSidebarLabels";
import { PRSidebarMilestone } from "./PRSidebarMilestone";
import { PRSidebarProjects } from "./PRSidebarProjects";
import { PRSidebarLinkedIssues } from "./PRSidebarLinkedIssues";
import type { PullRequest } from "@/lib/types";

interface PRSidebarProps {
  repoPath: string;
  login: string;
  pr: PullRequest;
  pollIntervalMs: number | null;
}

/** Persists across every tab (Conversation/Commits/Checks/Files), auto-collapsed by `PRTabBar`
 * when switching to Files to give the file list + diff full width. */
export function PRSidebar({ repoPath, login, pr, pollIntervalMs }: PRSidebarProps) {
  return (
    <div className="flex w-64 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border p-3">
      <PRSidebarReviewers
        repoPath={repoPath}
        login={login}
        pr={pr}
        pollIntervalMs={pollIntervalMs}
      />
      <PRSidebarAssignees repoPath={repoPath} login={login} pr={pr} />
      <PRSidebarLabels repoPath={repoPath} login={login} pr={pr} />
      <PRSidebarMilestone repoPath={repoPath} login={login} pr={pr} />
      <PRSidebarProjects repoPath={repoPath} login={login} pr={pr} />
      <PRSidebarLinkedIssues repoPath={repoPath} login={login} pr={pr} />
    </div>
  );
}
