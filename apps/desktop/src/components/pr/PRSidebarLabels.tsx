import { MultiSelectField } from "./MultiSelectField";
import { LabelChip } from "./LabelChip";
import { useLabels, useSyncLabels } from "@/hooks/queries/usePRMetadataOptions";
import type { PullRequest } from "@/lib/types";

interface PRSidebarLabelsProps {
  repoPath: string;
  login: string;
  pr: PullRequest;
}

export function PRSidebarLabels({ repoPath, login, pr }: PRSidebarLabelsProps) {
  const { data: labels = [] } = useLabels(repoPath, login);
  const syncLabels = useSyncLabels(repoPath, login, pr.number);

  return (
    <MultiSelectField
      label="Labels"
      placeholder="No labels"
      options={labels.map((l) => ({
        key: l.name,
        label: <LabelChip name={l.name} color={l.color} />,
        searchText: l.name,
      }))}
      selected={pr.labels}
      onChange={(next) => syncLabels.mutate(next)}
    />
  );
}
