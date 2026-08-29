import { useMemo } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CircleDotIcon, CircleCheckIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gitbud/ui/tooltip";
import { SingleSelectField } from "./SingleSelectField";
import { buildIssuePickerOptions } from "./issuePickerOptions";
import { parseLinkedIssues } from "@/lib/linkedIssues";
import { useIssueStates, useRepoIssues } from "@/hooks/queries/usePRMetadataOptions";
import { useUpdatePullRequestBody } from "@/hooks/queries/usePullRequestMeta";
import { useRemoteInfo } from "@/hooks/useRemoteInfo";
import { useRepoFullName } from "@/hooks/useRepoFullName";
import type { PullRequest } from "@/lib/types";

interface PRSidebarLinkedIssuesProps {
  repoPath: string;
  login: string;
  pr: PullRequest;
}

export function PRSidebarLinkedIssues({ repoPath, login, pr }: PRSidebarLinkedIssuesProps) {
  const refs = useMemo(() => parseLinkedIssues(pr.body), [pr.body]);
  const remoteInfo = useRemoteInfo(repoPath);
  // State lookup only covers same-repo references (no owner/repo prefix) — a cross-repo
  // reference is rare enough, and would need a second host/owner/repo resolved from the ref
  // text itself, that it's left as a plain unlinked chip rather than built out for this MVP.
  const sameRepoNumbers = refs.filter((r) => r.owner === null).map((r) => r.number);
  const { data: states = {} } = useIssueStates(repoPath, login, sameRepoNumbers);

  const { data: issues = [] } = useRepoIssues(repoPath, login);
  const repoFullName = useRepoFullName(repoPath);
  const updateBody = useUpdatePullRequestBody(repoPath, login, pr.number);

  // "Connecting" an issue is just appending a closing keyword to the body — GitHub has no
  // separate link API, this literal text is how it tracks the relationship (see
  // `parseLinkedIssues`, which is what turns it back into the chips below).
  const linkIssue = (number: number) => {
    if (sameRepoNumbers.includes(number)) return;
    const closesLine = `Closes #${number}`;
    const nextBody = pr.body ? `${pr.body}\n\n${closesLine}` : closesLine;
    updateBody.mutate(nextBody);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">Linked issues</span>
      {refs.length > 0 && (
        <div className="flex flex-col gap-1">
          {refs.map((ref) => {
            const label = ref.owner ? `${ref.owner}/${ref.repo}#${ref.number}` : `#${ref.number}`;
            const state = ref.owner ? undefined : states[ref.number];
            const clickable = !ref.owner && !!remoteInfo;
            return (
              <Tooltip key={label}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={!clickable}
                    onClick={() => {
                      if (clickable) void openUrl(`${remoteInfo.url}/issues/${ref.number}`);
                    }}
                    className="flex items-center gap-1.5 text-left text-sm hover:text-foreground disabled:cursor-default"
                  >
                    {state === "CLOSED" ? (
                      <CircleCheckIcon className="size-3.5 shrink-0 text-accent-purple" />
                    ) : (
                      <CircleDotIcon className="size-3.5 shrink-0 text-accent-green" />
                    )}
                    <span className="min-w-0 truncate text-muted-foreground">{label}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {state === "CLOSED" ? "Closed" : state === "OPEN" ? "Open" : "Open on GitHub"}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      )}
      {issues.length > 0 && (
        <SingleSelectField
          placeholder="Link an issue…"
          selected=""
          options={buildIssuePickerOptions(issues, repoFullName ?? "")}
          onChange={(key) => {
            if (key) linkIssue(Number(key));
          }}
        />
      )}
    </div>
  );
}
