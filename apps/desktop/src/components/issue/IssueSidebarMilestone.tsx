import { ProgressCircle } from "@gitbud/ui/progress-circle";
import { SingleSelectField } from "@/components/pr/SingleSelectField";
import { useMilestones } from "@/hooks/queries/usePRMetadataOptions";
import { useSetIssueMilestone } from "@/hooks/queries/useIssueMetadataOptions";
import type { Issue } from "@/lib/types";

interface IssueSidebarMilestoneProps {
  repoPath: string;
  login: string;
  issue: Issue;
}

export function IssueSidebarMilestone({ repoPath, login, issue }: IssueSidebarMilestoneProps) {
  const { data: milestones = [] } = useMilestones(repoPath, login);
  const setMilestone = useSetIssueMilestone(repoPath, login, issue.number);

  return (
    <SingleSelectField
      label="Milestone"
      placeholder="No milestone"
      clearLabel="Clear milestone"
      options={milestones.map((m) => {
        const total = (m.open_issues ?? 0) + (m.closed_issues ?? 0);
        const progress = total > 0 ? Math.round(((m.closed_issues ?? 0) / total) * 100) : 0;
        return {
          key: String(m.number),
          label: m.title,
          searchText: m.title,
          slotLeft: <ProgressCircle value={progress} size={14} strokeWidth={2} />,
          slotRight: `${progress}%`,
        };
      })}
      selected={issue.milestone ? String(issue.milestone.number) : ""}
      onChange={(next) => setMilestone.mutate(next)}
    />
  );
}
