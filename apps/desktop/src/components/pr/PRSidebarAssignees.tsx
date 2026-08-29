import { MultiSelectField } from "./MultiSelectField";
import { AvatarStack } from "./AvatarStack";
import { useAssignableUsers, useSyncAssignees } from "@/hooks/queries/usePRMetadataOptions";
import type { PullRequest } from "@/lib/types";

interface PRSidebarAssigneesProps {
  repoPath: string;
  login: string;
  pr: PullRequest;
}

export function PRSidebarAssignees({ repoPath, login, pr }: PRSidebarAssigneesProps) {
  const { data: assignableUsers = [] } = useAssignableUsers(repoPath, login);
  const syncAssignees = useSyncAssignees(repoPath, login, pr.number);

  return (
    <div className="flex flex-col gap-1.5">
      <AvatarStack people={pr.assignees} />
      <MultiSelectField
        label="Assignees"
        placeholder="No assignees"
        options={assignableUsers.map((u) => ({
          key: u.login,
          label: u.login,
          slotLeft: <img src={u.avatar_url} alt="" className="size-4 rounded-full" />,
        }))}
        selected={pr.assignees.map((a) => a.login)}
        onChange={(next) => syncAssignees.mutate(next)}
      />
    </div>
  );
}
