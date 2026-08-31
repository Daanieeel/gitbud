import { ResizeHandle } from "@/components/layout/ResizeHandle";
import { useResizableWidth } from "@/hooks/useResizableWidth";
import { IssueSidebarAssignees } from "./IssueSidebarAssignees";
import { IssueSidebarLabels } from "./IssueSidebarLabels";
import { IssueSidebarMilestone } from "./IssueSidebarMilestone";
import { IssueSidebarProjects } from "./IssueSidebarProjects";
import { IssueSidebarBranches } from "./IssueSidebarBranches";
import { IssueSidebarRelationships } from "./IssueSidebarRelationships";
import { IssueSidebarLock } from "./IssueSidebarLock";
import { IssueSidebarArchive } from "./IssueSidebarArchive";
import type { Issue } from "@/lib/types";

interface IssueSidebarProps {
  repoPath: string;
  login: string;
  issue: Issue;
}

/** Mirrors `PRSidebar.tsx`, minus base-branch/reviewers/linked-issues (no PR-tab precedent for
 * an issue linking other issues, and no base branch/reviewers on an issue at all). */
export function IssueSidebar({ repoPath, login, issue }: IssueSidebarProps) {
  const { width, onPointerDown } = useResizableWidth(
    "panel-width:issue-sidebar",
    256,
    200,
    420,
    true,
  );

  return (
    <div className="flex shrink-0" style={{ width }}>
      <ResizeHandle onPointerDown={onPointerDown} />
      <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto border-l border-border p-3">
        <IssueSidebarAssignees repoPath={repoPath} login={login} issue={issue} />
        <IssueSidebarLabels repoPath={repoPath} login={login} issue={issue} />
        <IssueSidebarMilestone repoPath={repoPath} login={login} issue={issue} />
        <IssueSidebarProjects repoPath={repoPath} login={login} issue={issue} />
        <IssueSidebarBranches repoPath={repoPath} login={login} issue={issue} />
        <IssueSidebarRelationships repoPath={repoPath} login={login} issue={issue} />
        <div className="flex flex-col gap-1">
          <IssueSidebarLock repoPath={repoPath} login={login} issue={issue} />
          <IssueSidebarArchive repoPath={repoPath} issue={issue} />
        </div>
      </div>
    </div>
  );
}
