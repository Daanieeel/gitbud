import { ProgressCircle } from "@gitbud/ui/progress-circle";
import { SingleSelectField } from "./SingleSelectField";
import { useMilestones, useSetMilestone } from "@/hooks/queries/usePRMetadataOptions";
import type { PullRequest } from "@/lib/types";

interface PRSidebarMilestoneProps {
  repoPath: string;
  login: string;
  pr: PullRequest;
}

export function PRSidebarMilestone({ repoPath, login, pr }: PRSidebarMilestoneProps) {
  const { data: milestones = [] } = useMilestones(repoPath, login);
  const setMilestone = useSetMilestone(repoPath, login, pr.number);

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
      selected={pr.milestone ? String(pr.milestone.number) : ""}
      onChange={(next) => setMilestone.mutate(next)}
    />
  );
}
