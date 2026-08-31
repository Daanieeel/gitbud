import { useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CircleDotIcon, ExternalLinkIcon, PaperclipIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@gitbud/ui/button";
import { Input } from "@gitbud/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@gitbud/ui/dialog";
import { ProgressCircle } from "@gitbud/ui/progress-circle";
import { CheckboxGroup } from "@gitbud/ui/checkbox-group";
import { MarkdownEditor, type MarkdownEditorHandle } from "@gitbud/markdown/editor";
import { MultiSelectField } from "@/components/pr/MultiSelectField";
import { LabelChip } from "@/components/pr/LabelChip";
import { SingleSelectField } from "@/components/pr/SingleSelectField";
import { useRepoStore } from "@/store/useRepoStore";
import { useGitHubStore } from "@/store/useGitHubStore";
import { useIssueStore } from "@/store/useIssueStore";
import { useCreateIssue } from "@/hooks/queries/useIssues";
import { useAssignableUsers, useLabels, useMilestones } from "@/hooks/queries/usePRMetadataOptions";
import { useRemoteInfo } from "@/hooks/useRemoteInfo";
import { api } from "@/lib/tauri";

interface CreateIssueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** A trimmed-down `CreatePRDialog`: title, body, labels, assignees, milestone only — no branch
 * picker, no diff/commit preview, no reviewers (issues have none of these concepts). Project
 * assignment is left to the sidebar after creation, same as labels/assignees/milestone can also
 * be adjusted there. The body field is `@gitbud/markdown`'s WYSIWYG editor — no separate preview
 * mode, since with that editor what's on screen already is the rendered form. */
export function CreateIssueDialog({ open, onOpenChange }: CreateIssueDialogProps) {
  const repoPath = useRepoStore((s) => s.selectedRepo);
  const currentLogin = useGitHubStore((s) => s.currentLogin);
  const createIssue = useCreateIssue(repoPath, currentLogin);
  const setFilter = useIssueStore((s) => s.setFilter);
  const selectIssue = useIssueStore((s) => s.selectIssue);

  const { data: labels = [] } = useLabels(repoPath, currentLogin);
  const { data: assignableUsers = [] } = useAssignableUsers(repoPath, currentLogin);
  const { data: milestones = [] } = useMilestones(repoPath, currentLogin);
  const remoteInfo = useRemoteInfo(repoPath);

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [selectedMilestone, setSelectedMilestone] = useState<string>("");
  const [createMore, setCreateMore] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const editorRef = useRef<MarkdownEditorHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset per-open state, same as CreatePRDialog does for its own fields. `createMore` is
  // deliberately left alone — sticky across opens within a session, matching GitHub's own
  // "Create more" checkbox.
  useEffect(() => {
    if (!open) return;
    setTitle("");
    setBody("");
    setSelectedLabels([]);
    setSelectedAssignees([]);
    setSelectedMilestone("");
  }, [open]);

  /** Uploads to GitHub's real attachment store and returns the hosted URL — the same
   * `uploads.github.com/user-attachments/assets` endpoint GitHub's own drag-and-drop-into-a-
   * textbox flow uses. It has no public API of its own (not listed in either the REST or
   * GraphQL reference) but was verified live against this account: it accepts the same OAuth
   * token this app already holds, and the URL it returns resolves once the body containing it
   * is actually saved (it 404s until then — an anti-orphan mechanism, not a bug). `MarkdownEditor`
   * falls back to a plain `data:` URI embed on its own if this throws (e.g. a non-github.com
   * host, which has no confirmed equivalent `uploads.` host, or a network hiccup). */
  const uploadImage = async (file: File): Promise<string> => {
    if (!repoPath || !currentLogin) throw new Error("no repo/login");
    const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
    return api.githubUploadAttachment(repoPath, currentLogin, file.name, file.type, bytes);
  };

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
      if (createMore) {
        toast.success(`Created issue #${issue.number}`);
        setTitle("");
        setBody("");
        setSelectedLabels([]);
        setSelectedAssignees([]);
        setSelectedMilestone("");
      } else {
        onOpenChange(false);
        setFilter("open");
        selectIssue(issue.number);
      }
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
          <div className="flex min-w-0 flex-[2] flex-col gap-2">
            <Input
              placeholder="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="shrink-0"
              autoFocus
            />
            <MarkdownEditor
              ref={editorRef}
              value={body}
              onChange={setBody}
              placeholder="Description"
              onUploadImage={uploadImage}
              className="min-h-0 flex-1"
            />
            <div className="flex shrink-0 items-center justify-between">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="text-muted-foreground"
              >
                <PaperclipIcon className="size-3.5" />
                Paste, drop or click to add files
              </Button>
              <span className="text-xs text-muted-foreground">Markdown enabled</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  for (const file of Array.from(e.target.files ?? [])) {
                    void editorRef.current?.insertImage(file);
                  }
                  e.target.value = "";
                }}
              />
            </div>
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
        <DialogFooter className="sm:items-center sm:gap-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!remoteInfo}
            className="text-muted-foreground sm:mr-auto"
            onClick={() => {
              if (!remoteInfo) return;
              const params = new URLSearchParams();
              if (title.trim()) params.set("title", title.trim());
              if (body.trim()) params.set("body", body);
              if (selectedLabels.length > 0) params.set("labels", selectedLabels.join(","));
              if (selectedAssignees.length > 0) {
                params.set("assignees", selectedAssignees.join(","));
              }
              const milestoneTitle = milestones.find(
                (m) => String(m.number) === selectedMilestone,
              )?.title;
              if (milestoneTitle) params.set("milestone", milestoneTitle);
              void openUrl(`${remoteInfo.url}/issues/new?${params.toString()}`);
            }}
          >
            <ExternalLinkIcon className="size-3.5" />
            Create on GitHub
          </Button>
          <CheckboxGroup
            className="text-sm text-muted-foreground"
            checked={createMore}
            onCheckedChange={(checked) => setCreateMore(checked === true)}
          >
            Create more
          </CheckboxGroup>
          <Button disabled={submitting || !title.trim()} onClick={() => void submit()}>
            <CircleDotIcon className="size-3.5" />
            {submitting ? "Creating…" : "Create Issue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
