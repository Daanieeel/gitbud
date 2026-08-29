import { ResizeHandle } from "@/components/layout/ResizeHandle";
import { useResizableWidth } from "@/hooks/useResizableWidth";
import { PRSidebarBaseBranch } from "./PRSidebarBaseBranch";
import { PRSidebarReviewers } from "./PRSidebarReviewers";
import { PRSidebarAssignees } from "./PRSidebarAssignees";
import { PRSidebarLabels } from "./PRSidebarLabels";
import { PRSidebarMilestone } from "./PRSidebarMilestone";
import { PRSidebarProjects } from "./PRSidebarProjects";
import { PRSidebarLinkedIssues } from "./PRSidebarLinkedIssues";
import { PRSidebarLock } from "./PRSidebarLock";
import { PRSidebarArchive } from "./PRSidebarArchive";
import type { PullRequest } from "@/lib/types";

interface PRSidebarProps {
  repoPath: string;
  login: string;
  pr: PullRequest;
  pollIntervalMs: number | null;
}

/** Persists across every tab (Conversation/Commits/Checks/Files), auto-collapsed by `PRTabBar`
 * when switching to Files to give the file list + diff full width. Resizes from its left edge
 * (`invert: true` — the opposite of every other panel in this app, which all resize from their
 * right edge instead). */
export function PRSidebar({ repoPath, login, pr, pollIntervalMs }: PRSidebarProps) {
  const { width, onPointerDown } = useResizableWidth("panel-width:pr-sidebar", 256, 200, 420, true);

  return (
    <div className="flex shrink-0" style={{ width }}>
      <ResizeHandle onPointerDown={onPointerDown} />
      <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto border-l border-border p-3">
        <PRSidebarBaseBranch repoPath={repoPath} login={login} pr={pr} />
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
        <PRSidebarLock repoPath={repoPath} login={login} pr={pr} />
        <PRSidebarArchive repoPath={repoPath} pr={pr} />
      </div>
    </div>
  );
}
