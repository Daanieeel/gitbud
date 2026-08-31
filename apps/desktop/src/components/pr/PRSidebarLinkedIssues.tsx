import { openUrl } from "@tauri-apps/plugin-opener";
import { CircleDotIcon, CircleCheckIcon, ExternalLinkIcon, XIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gitbud/ui/tooltip";
import { SingleSelectField } from "./SingleSelectField";
import { buildIssuePickerOptions } from "./issuePickerOptions";
import { useClosingIssues, useRepoIssues } from "@/hooks/queries/usePRMetadataOptions";
import { useUpdatePullRequestBody } from "@/hooks/queries/usePullRequestMeta";
import { useRemoteInfo } from "@/hooks/useRemoteInfo";
import { useRepoFullName } from "@/hooks/useRepoFullName";
import type { ClosingIssueRef, PullRequest } from "@/lib/types";

interface PRSidebarLinkedIssuesProps {
  repoPath: string;
  login: string;
  pr: PullRequest;
}

function refPattern(ref: ClosingIssueRef, repoFullName: string | null): string {
  const sameRepo = repoFullName === `${ref.repo_owner}/${ref.repo_name}`;
  const label = sameRepo ? `#${ref.number}` : `${ref.repo_owner}/${ref.repo_name}#${ref.number}`;
  // SAFETY: a ref's own repo owner/name and number can't themselves contain regex metacharacters
  // (GitHub repo names/owners are `[A-Za-z0-9._-]` only, and `number` is a plain integer) — the
  // literal `#` in `label` is the only special character actually present, and it isn't one.
  return label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Matches a whole line that's *only* a closing keyword + this ref (optional surrounding
 * whitespace) — exactly the shape `linkIssue` below itself writes. A reference embedded in more
 * complex hand-written text, or one that exists purely because the PR's branch is linked to the
 * issue via that issue's own "Development" panel (no body text at all), doesn't match — there's
 * nothing in the body this component could safely remove for those, so the remove button is
 * left off entirely rather than risk mangling unrelated content or silently doing nothing. */
function closingLineRegex(ref: ClosingIssueRef, repoFullName: string | null): RegExp {
  return new RegExp(
    `^[ \\t]*(close[sd]?|fix(?:e[sd])?|resolve[sd]?)[ \\t]+${refPattern(ref, repoFullName)}[ \\t]*$`,
    "im",
  );
}

export function PRSidebarLinkedIssues({ repoPath, login, pr }: PRSidebarLinkedIssuesProps) {
  // `closingIssuesReferences` (GitHub's own computation, driving its own PR sidebar) rather than
  // parsing "Closes #N" out of the PR body ourselves — the body-text-only heuristic this used to
  // be missed a PR opened from a branch that was linked to an issue via that issue's own
  // "Development" panel, which carries no closing keyword in the body at all.
  const { data: refs = [] } = useClosingIssues(repoPath, login, pr.number);
  const remoteInfo = useRemoteInfo(repoPath);

  const { data: issues = [] } = useRepoIssues(repoPath, login);
  const repoFullName = useRepoFullName(repoPath);
  const updateBody = useUpdatePullRequestBody(repoPath, login, pr.number);

  // "Connecting" an issue is just appending a closing keyword to the body — GitHub has no
  // separate link API, this literal text is how it tracks the relationship (surfaced back via
  // `closingIssuesReferences` above, not by re-parsing this text ourselves).
  const linkIssue = (number: number) => {
    if (refs.some((r) => r.number === number)) return;
    const closesLine = `Closes #${number}`;
    const nextBody = pr.body ? `${pr.body}\n\n${closesLine}` : closesLine;
    updateBody.mutate(nextBody);
  };

  const unlinkIssue = (ref: ClosingIssueRef) => {
    const stripped = (pr.body ?? "")
      .replace(closingLineRegex(ref, repoFullName), "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    updateBody.mutate(stripped);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">Linked issues</span>
      {refs.length > 0 && (
        <div className="flex flex-col gap-1">
          {refs.map((ref) => {
            const sameRepo = repoFullName === `${ref.repo_owner}/${ref.repo_name}`;
            const label = sameRepo
              ? `#${ref.number}`
              : `${ref.repo_owner}/${ref.repo_name}#${ref.number}`;
            const canUnlink = closingLineRegex(ref, repoFullName).test(pr.body ?? "");
            return (
              <div
                key={`${ref.repo_owner}/${ref.repo_name}#${ref.number}`}
                className="flex items-center gap-1.5"
              >
                <div className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
                  {ref.state === "CLOSED" ? (
                    <CircleCheckIcon className="size-3.5 shrink-0 text-accent-purple" />
                  ) : (
                    <CircleDotIcon className="size-3.5 shrink-0 text-accent-green" />
                  )}
                  <span className="min-w-0 truncate text-muted-foreground">{label}</span>
                </div>
                {remoteInfo && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <a
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          // SAFETY: `remoteInfo.url` is always this repo's own well-formed
                          // remote web URL (e.g. "https://github.com/owner/repo") — `new URL`
                          // on it never throws; only its origin is reused here, to point at a
                          // *different* owner/repo for a cross-repo closing reference.
                          const origin = new URL(remoteInfo.url).origin;
                          const url = sameRepo
                            ? `${remoteInfo.url}/issues/${ref.number}`
                            : `${origin}/${ref.repo_owner}/${ref.repo_name}/issues/${ref.number}`;
                          void openUrl(url);
                        }}
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLinkIcon className="size-3.5" />
                      </a>
                    </TooltipTrigger>
                    <TooltipContent>Open on GitHub</TooltipContent>
                  </Tooltip>
                )}
                {canUnlink && (
                  <button
                    type="button"
                    disabled={updateBody.isPending}
                    onClick={() => unlinkIssue(ref)}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                )}
              </div>
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
