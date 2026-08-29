import { useState } from "react";
import { CheckIcon } from "lucide-react";
import { SingleSelectField } from "./SingleSelectField";
import { useAddToProject, useProjects } from "@/hooks/queries/usePRMetadataOptions";
import type { PullRequest } from "@/lib/types";

interface PRSidebarProjectsProps {
  repoPath: string;
  login: string;
  pr: PullRequest;
}

/** Add-only: GitHub Projects (v2) item membership (which board(s) a PR is already on, moving it
 * between status columns) is a materially bigger surface than this MVP covers — see the PR
 * viewer plan's explicit scope exclusion. Rather than show a `selected` state we have no way to
 * know is actually correct (misleading in exactly the "looks live, isn't" way this feature is
 * meant to avoid), this always renders as unselected and just fires the add call; "already on
 * this project" or removing one is a GitHub-only action for now. */
export function PRSidebarProjects({ repoPath, login, pr }: PRSidebarProjectsProps) {
  const { data: projects = [] } = useProjects(repoPath, login);
  const addToProject = useAddToProject(repoPath, login, pr.number);
  const [justAdded, setJustAdded] = useState<string | null>(null);

  if (projects.length === 0) return null;

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">Projects</span>
      <SingleSelectField
        placeholder="Add to project…"
        options={projects.map((p) => ({
          key: p.id,
          label: p.title,
          searchText: p.title,
          slotRight:
            justAdded === p.id ? <CheckIcon className="size-3.5 text-accent-green" /> : null,
        }))}
        selected=""
        onChange={(projectId) => {
          if (!projectId) return;
          addToProject.mutate(projectId, { onSuccess: () => setJustAdded(projectId) });
        }}
      />
    </div>
  );
}
