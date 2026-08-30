import { MultiSelectField } from "@/components/pr/MultiSelectField";
import { LabelChip } from "@/components/pr/LabelChip";
import { useLabels } from "@/hooks/queries/usePRMetadataOptions";
import { useSyncIssueLabels } from "@/hooks/queries/useIssueMetadataOptions";
import type { Issue } from "@/lib/types";

interface IssueSidebarLabelsProps {
  repoPath: string;
  login: string;
  issue: Issue;
}

export function IssueSidebarLabels({ repoPath, login, issue }: IssueSidebarLabelsProps) {
  const { data: labels = [] } = useLabels(repoPath, login);
  const syncLabels = useSyncIssueLabels(repoPath, login, issue.number);

  return (
    <MultiSelectField
      label="Labels"
      placeholder="No labels"
      options={labels.map((l) => ({
        key: l.name,
        label: <LabelChip name={l.name} color={l.color} />,
        searchText: l.name,
      }))}
      selected={issue.labels}
      onChange={(next) => syncLabels.mutate(next)}
    />
  );
}
