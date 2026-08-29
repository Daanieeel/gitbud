import { useState } from "react";
import { PRDetailHeader } from "./PRDetailHeader";
import { PRTabBar } from "./PRTabBar";
import { PRSidebar } from "./PRSidebar";
import { ConversationTab } from "./tabs/ConversationTab";
import { CommitsTab } from "./tabs/CommitsTab";
import { ChecksTab } from "./tabs/ChecksTab";
import { FilesTab } from "./tabs/FilesTab";
import { MergePRDialog } from "./MergePRDialog";
import { usePRStore } from "@/store/usePRStore";
import { usePullRequestMeta } from "@/hooks/queries/usePullRequestMeta";
import { usePullRequestDetail } from "@/hooks/queries/usePullRequests";
import { usePullRequestCommits } from "@/hooks/queries/usePRCommits";
import { useCheckRuns, prPollIntervalMs, useIsPrTabActive } from "@/hooks/queries/useCheckRuns";
import type { PullRequest } from "@/lib/types";

interface PRDetailProps {
  repoPath: string;
  login: string;
  pr: PullRequest;
}

/** A thin shell: fetches the freshened single-PR object (see `usePullRequestMeta`'s doc comment
 * for why the list-sourced `pr` alone isn't enough), then renders header + tab bar + whichever
 * tab is active + the persistent sidebar. Every tab/sidebar component fetches its own data. */
export function PRDetail({ repoPath, login, pr: listPr }: PRDetailProps) {
  const [mergeOpen, setMergeOpen] = useState(false);
  const activeTab = usePRStore((s) => s.activeTab);
  const sidebarCollapsed = usePRStore((s) => s.sidebarCollapsed);
  const isPrTabActive = useIsPrTabActive();
  const pollIntervalMs = prPollIntervalMs(listPr, isPrTabActive, true);

  const { data: pr = listPr } = usePullRequestMeta(repoPath, login, listPr, pollIntervalMs);
  const { data: detail } = usePullRequestDetail(repoPath, login, pr.number, pr.head_sha);
  const { commits } = usePullRequestCommits(repoPath, login, pr.number, pr.head_sha);
  const { data: checkRuns = null } = useCheckRuns(repoPath, login, pr.head_sha, pollIntervalMs);

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <PRDetailHeader
        repoPath={repoPath}
        login={login}
        pr={pr}
        onMergeClick={() => setMergeOpen(true)}
      />
      <PRTabBar
        filesCount={detail?.files.length ?? 0}
        commitsCount={commits.length}
        checksCount={checkRuns?.length ?? 0}
      />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {activeTab === "conversation" && (
            <ConversationTab repoPath={repoPath} login={login} pr={pr} />
          )}
          {activeTab === "commits" && <CommitsTab repoPath={repoPath} login={login} pr={pr} />}
          {activeTab === "checks" && <ChecksTab repoPath={repoPath} login={login} pr={pr} />}
          {activeTab === "files" && <FilesTab repoPath={repoPath} login={login} pr={pr} />}
        </div>
        {!sidebarCollapsed && (
          <PRSidebar repoPath={repoPath} login={login} pr={pr} pollIntervalMs={pollIntervalMs} />
        )}
      </div>
      <MergePRDialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        repoPath={repoPath}
        login={login}
        pr={pr}
      />
    </div>
  );
}
