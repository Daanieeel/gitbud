import { useEffect, useState } from "react";
import { CircleDotIcon } from "lucide-react";
import { Button } from "@gitbud/ui/button";
import { Input } from "@gitbud/ui/input";
import { Textarea } from "@gitbud/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@gitbud/ui/dialog";
import { ProgressCircle } from "@gitbud/ui/progress-circle";
import { MultiSelectField } from "@/components/pr/MultiSelectField";
import { LabelChip } from "@/components/pr/LabelChip";
import { SingleSelectField } from "@/components/pr/SingleSelectField";
import { useRepoStore } from "@/store/useRepoStore";
import { useGitHubStore } from "@/store/useGitHubStore";
import { useIssueStore } from "@/store/useIssueStore";
import { useCreateIssue } from "@/hooks/queries/useIssues";
import { useAssignableUsers, useLabels, useMilestones } from "@/hooks/queries/usePRMetadataOptions";

interface CreateIssueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** A trimmed-down `CreatePRDialog`: title, body, labels, assignees, milestone only — no branch
 * picker, no diff/commit preview, no draft toggle, no reviewers (issues have none of these
 * concepts). Project assignment is left to the sidebar after creation, same as labels/assignees/
 * milestone can also be adjusted there. */
export function CreateIssueDialog({ open, onOpenChange }: CreateIssueDialogProps) {
  const repoPath = useRepoStore((s) => s.selectedRepo);
  const currentLogin = useGitHubStore((s) => s.currentLogin);
  const createIssue = useCreateIssue(repoPath, currentLogin);
  const setFilter = useIssueStore((s) => s.setFilter);
  const selectIssue = useIssueStore((s) => s.selectIssue);

  const { data: labels = [] } = useLabels(repoPath, currentLogin);
  const { data: assignableUsers = [] } = useAssignableUsers(repoPath, currentLogin);
  const { data: milestones = [] } = useMilestones(repoPath, currentLogin);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [selectedMilestone, setSelectedMilestone] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  // Reset per-open state, same as CreatePRDialog does for its own fields.
  useEffect(() => {
    if (!open) return;
    setTitle("");
    setBody("");
    setSelectedLabels([]);
    setSelectedAssignees([]);
    setSelectedMilestone("");
  }, [open]);

  const submit = async () => {
    if (!repoPath || !currentLogin || !title.trim()) return;
    setSubmitting(true);
    try {
      const issue = await createIssue.mutateAsync({
        title: title.trim(),
        body,
        labels: selectedLabels,
        assignees: selectedAssignees,
        milestone: selectedMilestone ? Number(selectedMilestone) : null,
      });
      onOpenChange(false);
      setFilter("open");
      selectIssue(issue.number);
    } finally {
      setSubmitting(false);
    }
  };

  if (!repoPath || !currentLogin) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[70vh] w-[60vw] max-w-none flex-col">
        <DialogHeader>
          <DialogTitle>New Issue</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 gap-4">
          <div className="flex min-w-0 flex-[2] flex-col gap-3">
            <Input
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="shrink-0"
              autoFocus
            />
            <Textarea
              placeholder="Description"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="min-h-0 flex-1"
            />
          </div>
          <div className="flex w-56 shrink-0 flex-col gap-4 overflow-auto border-l border-border pl-4">
            <MultiSelectField
              label="Labels"
              placeholder="No labels"
              options={labels.map((l) => ({
                key: l.name,
                label: <LabelChip name={l.name} color={l.color} />,
                searchText: l.name,
              }))}
              selected={selectedLabels}
              onChange={setSelectedLabels}
            />
            <MultiSelectField
              label="Assignees"
              placeholder="No assignees"
              options={assignableUsers.map((u) => ({
                key: u.login,
                label: u.login,
                slotLeft: <img src={u.avatar_url} alt="" className="size-4 rounded-full" />,
              }))}
              selected={selectedAssignees}
              onChange={setSelectedAssignees}
            />
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
              selected={selectedMilestone}
              onChange={setSelectedMilestone}
            />
          </div>
        </div>
        <DialogFooter>
          <Button disabled={submitting || !title.trim()} onClick={() => void submit()}>
            <CircleDotIcon className="size-3.5" />
            {submitting ? "Creating…" : "Create Issue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
