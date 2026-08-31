import { IssueDetailHeader } from "./IssueDetailHeader";
import { IssueSidebar } from "./IssueSidebar";
import { IssueConversationTab } from "./IssueConversationTab";
import { useIssueStore } from "@/store/useIssueStore";
import { useIssueMeta } from "@/hooks/queries/useIssueMeta";
import type { Issue } from "@/lib/types";

interface IssueDetailProps {
  repoPath: string;
  login: string;
  issue: Issue;
}

/** A thin shell, mirroring `PRDetail.tsx`: fetches the freshened single-issue object, then
 * renders header + conversation + the persistent sidebar. No sub-tab bar — an issue has one
 * detail view (no diffs/commits/checks the way a PR does). */
export function IssueDetail({ repoPath, login, issue: listIssue }: IssueDetailProps) {
  const sidebarCollapsed = useIssueStore((s) => s.sidebarCollapsed);
  // Issues have no CI to poll against, so this refetches on a plain fixed interval rather than
  // `prPollIntervalMs`'s CI-aware cadence — labels/assignees/milestone are the only things that
  // can change while viewing.
  const { data: issue = listIssue } = useIssueMeta(repoPath, login, listIssue, 60_000);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <IssueDetailHeader repoPath={repoPath} login={login} issue={issue} />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <IssueConversationTab repoPath={repoPath} login={login} issue={issue} />
        </div>
        {!sidebarCollapsed && <IssueSidebar repoPath={repoPath} login={login} issue={issue} />}
      </div>
    </div>
  );
}
