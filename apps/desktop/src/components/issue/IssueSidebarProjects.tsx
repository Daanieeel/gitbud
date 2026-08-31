import { useState } from "react";
import { CheckIcon } from "lucide-react";
import { SingleSelectField } from "@/components/pr/SingleSelectField";
import { useProjects } from "@/hooks/queries/usePRMetadataOptions";
import { useAddIssueToProject } from "@/hooks/queries/useIssueMetadataOptions";
import type { Issue } from "@/lib/types";

interface IssueSidebarProjectsProps {
  repoPath: string;
  login: string;
  issue: Issue;
}

/** Add-only — mirrors `PRSidebarProjects.tsx`'s own scope note: which project(s) an issue is
 * already on isn't tracked here, so this always renders unselected and just fires the add
 * call. */
export function IssueSidebarProjects({ repoPath, login, issue }: IssueSidebarProjectsProps) {
  const { data: projects = [] } = useProjects(repoPath, login);
  const addToProject = useAddIssueToProject(repoPath, login, issue.number);
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
