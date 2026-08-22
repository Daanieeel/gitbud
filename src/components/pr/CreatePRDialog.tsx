import { useEffect, useState } from "react";
import { GitPullRequestIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRepoStore } from "@/store/useRepoStore";
import { useGitHubStore } from "@/store/useGitHubStore";
import { usePRStore } from "@/store/usePRStore";
import { api } from "@/lib/tauri";

interface CreatePRDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreatePRDialog({ open, onOpenChange }: CreatePRDialogProps) {
  const repoPath = useRepoStore((s) => s.selectedRepo);
  const branch = useRepoStore((s) => s.branch);
  const branches = useRepoStore((s) => s.branches);
  const commits = useRepoStore((s) => s.commits);
  const currentLogin = useGitHubStore((s) => s.currentLogin);
  const createPR = usePRStore((s) => s.createPR);

  const defaultBase = branches.find((b) => !b.is_remote && (b.name === "main" || b.name === "master"))?.name ?? "main";
  const [base, setBase] = useState(defaultBase);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [draft, setDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Prefill the title from the branch's most recent commit so there's rarely a blank field
  // to fill in — the user can still edit or replace it before creating the PR.
  useEffect(() => {
    if (!open || title) return;
    const lastSummary = commits[0]?.summary;
    if (lastSummary) setTitle(lastSummary);
    else if (branch) setTitle(branch);
  }, [open, title, commits, branch]);

  useEffect(() => {
    if (!open || !repoPath || body) return;
    void api.readPrTemplate(repoPath).then((template) => {
      if (template) setBody(template);
    });
  }, [open, repoPath, body]);

  const submit = async () => {
    if (!repoPath || !currentLogin || !branch || !title.trim()) return;
    setSubmitting(true);
    try {
      await createPR(repoPath, currentLogin, title.trim(), branch, base, body, draft);
      onOpenChange(false);
      setTitle("");
      setBody("");
    } finally {
      setSubmitting(false);
    }
  };

  if (!repoPath || !currentLogin) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Pull Request</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">base:</span>
            <Input value={base} onChange={(e) => setBase(e.target.value)} className="h-7 w-32" />
            <span className="text-muted-foreground">← compare:</span>
            <span className="font-mono">{branch}</span>
          </div>
          <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea
            placeholder="Description (loads .github/PULL_REQUEST_TEMPLATE.md if present)"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            className="w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} />
            Create as draft
          </label>
        </div>
        <DialogFooter>
          <Button
            disabled={submitting || !title.trim()}
            title={`Open a PR from ${branch ?? "this branch"} into ${base}`}
            onClick={() => void submit()}
          >
            <GitPullRequestIcon className="size-3.5" />
            {submitting ? "Creating…" : "Create Pull Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
