import { useMemo } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CircleDotIcon, CircleCheckIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gitbud/ui/tooltip";
import { parseLinkedIssues } from "@/lib/linkedIssues";
import { useIssueStates } from "@/hooks/queries/usePRMetadataOptions";
import { useRemoteInfo } from "@/hooks/useRemoteInfo";
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

  if (refs.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">Linked issues</span>
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
    </div>
  );
}
