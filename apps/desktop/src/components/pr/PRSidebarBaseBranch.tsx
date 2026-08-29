import { SingleSelectField } from "./SingleSelectField";
import { useBranches } from "@/hooks/queries/useBranches";
import { useUpdatePullRequestBase } from "@/hooks/queries/usePullRequestMeta";
import type { PullRequest } from "@/lib/types";

interface PRSidebarBaseBranchProps {
  repoPath: string;
  login: string;
  pr: PullRequest;
}

/** Sits at the top of the sidebar — retargeting only makes sense while the PR is still open,
 * same restriction `MergePRDialog`'s own base-branch select already has. */
export function PRSidebarBaseBranch({ repoPath, login, pr }: PRSidebarBaseBranchProps) {
  const { data: branchData } = useBranches(repoPath);
  const updateBase = useUpdatePullRequestBase(repoPath, login, pr.number);

  if (pr.merged || pr.state !== "open") return null;

  const localBranchNames = (branchData?.branches ?? [])
    .filter((b) => !b.is_remote && b.name !== pr.head_ref)
    .map((b) => b.name);
  // The PR's current base might not be checked out locally (e.g. reviewing someone else's PR
  // against a branch you've never fetched) — keep it selectable regardless.
  const baseOptions = localBranchNames.includes(pr.base_ref)
    ? localBranchNames
    : [pr.base_ref, ...localBranchNames];

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">Base branch</span>
      <SingleSelectField
        options={baseOptions.map((name) => ({ key: name, label: name }))}
        selected={pr.base_ref}
        onChange={(next) => {
          if (next && next !== pr.base_ref) updateBase.mutate(next);
        }}
        triggerClassName="font-mono text-sm"
        contentClassName="font-mono"
      />
    </div>
  );
}
