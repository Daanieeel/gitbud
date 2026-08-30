import { MultiSelectField } from "@/components/pr/MultiSelectField";
import { AvatarStack } from "@/components/pr/AvatarStack";
import { useAssignableUsers } from "@/hooks/queries/usePRMetadataOptions";
import { useSyncIssueAssignees } from "@/hooks/queries/useIssueMetadataOptions";
import type { Issue } from "@/lib/types";

interface IssueSidebarAssigneesProps {
  repoPath: string;
  login: string;
  issue: Issue;
}

export function IssueSidebarAssignees({ repoPath, login, issue }: IssueSidebarAssigneesProps) {
  const { data: assignableUsers = [] } = useAssignableUsers(repoPath, login);
  const syncAssignees = useSyncIssueAssignees(repoPath, login, issue.number);

  return (
    <div className="flex flex-col gap-1.5">
      <AvatarStack people={issue.assignees} />
      <MultiSelectField
        label="Assignees"
        placeholder="No assignees"
        options={assignableUsers.map((u) => ({
          key: u.login,
          label: u.login,
          slotLeft: <img src={u.avatar_url} alt="" className="size-4 rounded-full" />,
        }))}
        selected={issue.assignees.map((a) => a.login)}
        onChange={(next) => syncAssignees.mutate(next)}
      />
    </div>
  );
}
