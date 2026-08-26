import { useEffect, useMemo, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { openUrl } from "@tauri-apps/plugin-opener";
import { GitPullRequestCreateArrow, GitPullRequestDraftIcon } from "lucide-react";
import { Button } from "@gitbud/ui/button";
import { Input } from "@gitbud/ui/input";
import { Textarea } from "@gitbud/ui/textarea";
import { CheckboxGroup } from "@gitbud/ui/checkbox-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gitbud/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@gitbud/ui/dialog";
import { DiffView } from "@gitbud/ui/diff-view";
import { FileTypeIcon } from "@/lib/file-icons";
import { FileStatusIcon } from "@/lib/file-status";
import { FilePathLabel } from "@/components/changes/FilePathLabel";
import { MultiSelectField } from "./MultiSelectField";
import { useArrowKeyFileNav } from "@/hooks/useArrowKeyFileNav";
import { useRepoStore } from "@/store/useRepoStore";
import { useBranches } from "@/hooks/queries/useBranches";
import { useGitHubStore } from "@/store/useGitHubStore";
import { useCreatePullRequest } from "@/hooks/queries/usePullRequests";
import { useSettingsStore } from "@/store/useSettingsStore";
import { usePRStore } from "@/store/usePRStore";
import { api } from "@/lib/tauri";
import { cn } from "@gitbud/ui/utils";
import type { FileDiff, ImageDiff, Label, AssignableUser, Milestone, Project, CommitSearchResult } from "@/lib/types";

interface CreatePRDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function branchNameToPrTitle(name: string): string {
  const slashIdx = name.indexOf("/");
  const withColon = slashIdx === -1 ? name : `${name.slice(0, slashIdx)}: ${name.slice(slashIdx + 1)}`;
  return withColon.replace(/-/g, " ");
}

export function CreatePRDialog({ open, onOpenChange }: CreatePRDialogProps) {
  const repoPath = useRepoStore((s) => s.selectedRepo);
  const { data: branchData } = useBranches(repoPath);
  const branch = branchData?.branch ?? null;
  const branches = branchData?.branches ?? [];
  const currentLogin = useGitHubStore((s) => s.currentLogin);
  const createPRMutation = useCreatePullRequest(repoPath, currentLogin);
  const openPrAfterCreation = useSettingsStore((s) => s.settings.open_pr_after_creation);
  const setActiveTab = useRepoStore((s) => s.setActiveTab);
  const setPRFilter = usePRStore((s) => s.setFilter);
  const selectPR = usePRStore((s) => s.selectPR);

  const localBranches = useMemo(
    () => branches.filter((b) => !b.is_remote && b.name !== branch),
    [branches, branch],
  );
  const defaultBase = localBranches.find((b) => b.name === "main" || b.name === "master")?.name ?? localBranches[0]?.name ?? "main";
  const [base, setBase] = useState(defaultBase);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [draft, setDraft] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [labels, setLabels] = useState<Label[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [selectedReviewers, setSelectedReviewers] = useState<string[]>([]);
  const [selectedMilestone, setSelectedMilestone] = useState<string>("");
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);

  const [mainView, setMainView] = useState<"files" | "commits">("files");
  const [diffFiles, setDiffFiles] = useState<[string, string][]>([]);
  const [diffLoading, setDiffLoading] = useState(false);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedDiff, setSelectedDiff] = useState<FileDiff | null>(null);
  const [selectedImageDiff, setSelectedImageDiff] = useState<ImageDiff | null>(null);
  const [branchCommits, setBranchCommits] = useState<CommitSearchResult[]>([]);
  const [branchCommitsLoading, setBranchCommitsLoading] = useState(false);

  // Reset per-open state and pick a sane default base once the dialog is (re)opened.
  useEffect(() => {
    if (!open) return;
    setBase((prev) => (localBranches.some((b) => b.name === prev) ? prev : defaultBase));
  }, [open]);

  // Prefill the title with the branch name so there's rarely a blank field to fill in — but
  // only once, right at the moment the dialog opens (and only if there's nothing there already,
  // e.g. left over from a prior cancelled open). Keyed strictly off the open transition itself
  // rather than depending on `branch`/`title`, so nothing later — switching branches in the
  // background, or the user clearing the field — touches it again while the dialog stays open.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open && !wasOpenRef.current && branch) {
      setTitle((prev) => prev || branchNameToPrTitle(branch));
    }
    wasOpenRef.current = open;
  }, [open, branch]);

  useEffect(() => {
    if (!open || !repoPath || body) return;
    void api.readPrTemplate(repoPath).then((template) => {
      if (template) setBody(template);
    });
  }, [open, repoPath, body]);

  useEffect(() => {
    if (!open || !repoPath || !currentLogin) return;
    void api.githubListLabels(repoPath, currentLogin).then(setLabels).catch(() => setLabels([]));
    void api
      .githubListAssignableUsers(repoPath, currentLogin)
      .then(setAssignableUsers)
      .catch(() => setAssignableUsers([]));
    void api.githubListMilestones(repoPath, currentLogin).then(setMilestones).catch(() => setMilestones([]));
    // Projects (v2) is GraphQL-only and errors on repos it isn't enabled for — swallow rather
    // than blocking the rest of the dialog on a feature most repos won't have configured.
    void api.githubListProjects(repoPath, currentLogin).then(setProjects).catch(() => setProjects([]));
  }, [open, repoPath, currentLogin]);

  useEffect(() => {
    if (!open || !repoPath || !branch || !base) return;
    setDiffLoading(true);
    setSelectedFilePath(null);
    setSelectedDiff(null);
    void api
      .getBranchDiffFiles(repoPath, base, branch)
      .then(setDiffFiles)
      .catch(() => setDiffFiles([]))
      .finally(() => setDiffLoading(false));

    setBranchCommitsLoading(true);
    void api
      .getBranchCommits(repoPath, base, branch)
      .then(setBranchCommits)
      .catch(() => setBranchCommits([]))
      .finally(() => setBranchCommitsLoading(false));
  }, [open, repoPath, branch, base]);

  useEffect(() => {
    if (!repoPath || !branch || !base || !selectedFilePath) {
      setSelectedDiff(null);
      setSelectedImageDiff(null);
      return;
    }
    setSelectedImageDiff(null);
    void api.getBranchDiffFile(repoPath, base, branch, selectedFilePath).then((diff) => {
      setSelectedDiff(diff);
      if (diff.is_image) {
        void api.getBranchImageDiff(repoPath, base, branch, selectedFilePath).then(setSelectedImageDiff);
      }
    });
  }, [repoPath, branch, base, selectedFilePath]);

  const filePaths = useMemo(() => diffFiles.map(([path]) => path), [diffFiles]);
  const handleArrowNav = useArrowKeyFileNav(filePaths, selectedFilePath, setSelectedFilePath);
  const fileListRef = useRef<HTMLDivElement>(null);

  const submit = async () => {
    if (!repoPath || !currentLogin || !branch || !title.trim()) return;
    setSubmitting(true);
    try {
      const pr = await createPRMutation.mutateAsync({
        title: title.trim(),
        head: branch,
        base,
        body,
        draft,
        labels: selectedLabels,
        assignees: selectedAssignees,
        reviewers: selectedReviewers,
      });
      // Milestone and projects go through separate endpoints from labels/assignees/reviewers
      // (a single-value issue field, and a GraphQL-only surface, respectively), so they're
      // applied here rather than folded into createPR.
      await Promise.all([
        selectedMilestone
          ? api.githubSetMilestone(repoPath, currentLogin, pr.number, Number(selectedMilestone))
          : Promise.resolve(),
        ...selectedProjects.map((projectId) =>
          api.githubAddPullRequestToProject(repoPath, currentLogin, pr.number, projectId),
        ),
      ]);
      onOpenChange(false);
      if (openPrAfterCreation === "provider") {
        void openUrl(pr.html_url);
      } else {
        setPRFilter("open");
        selectPR(pr.number);
        setActiveTab("pulls");
      }
      setTitle("");
      setBody("");
      setSelectedLabels([]);
      setSelectedAssignees([]);
      setSelectedReviewers([]);
      setSelectedMilestone("");
      setSelectedProjects([]);
    } finally {
      setSubmitting(false);
    }
  };

  if (!repoPath || !currentLogin) return null;

  const userOptions = assignableUsers.map((u) => ({
    key: u.login,
    label: (
      <span className="flex items-center gap-1.5">
        <img src={u.avatar_url} alt="" className="size-4 rounded-full" />
        {u.login}
      </span>
    ),
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[75vh] w-[75vw] max-w-none flex-col">
        <DialogHeader>
          <DialogTitle>Preview Pull Request</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 gap-4">
          <div className="flex min-w-0 flex-[2] flex-col gap-3">
            <div className="flex shrink-0 items-center gap-2 text-sm">
              <select
                value={base}
                onChange={(e) => setBase(e.target.value)}
                className="h-7 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {localBranches.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
              <span className="text-muted-foreground">←</span>
              <span className="font-mono">{branch}</span>
            </div>
            <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} className="shrink-0" />
            <Textarea
              placeholder="Description"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              className="shrink-0"
            />
            <div className="flex shrink-0 gap-1 border-b border-border text-sm">
              <button
                onClick={() => setMainView("files")}
                className={cn(
                  "border-b-2 px-2 py-1.5 text-muted-foreground hover:text-foreground",
                  mainView === "files" ? "border-primary text-foreground" : "border-transparent",
                )}
              >
                Files changed{diffFiles.length > 0 && ` (${diffFiles.length})`}
              </button>
              <button
                onClick={() => setMainView("commits")}
                className={cn(
                  "border-b-2 px-2 py-1.5 text-muted-foreground hover:text-foreground",
                  mainView === "commits" ? "border-primary text-foreground" : "border-transparent",
                )}
              >
                Commits{branchCommits.length > 0 && ` (${branchCommits.length})`}
              </button>
            </div>
            {mainView === "files" ? (
              <div className="flex min-h-0 flex-1 overflow-hidden rounded-md border border-border">
                <div
                  ref={fileListRef}
                  tabIndex={0}
                  onKeyDown={handleArrowNav}
                  className="w-56 shrink-0 overflow-auto border-r border-border outline-none"
                >
                  {diffLoading ? (
                    <div className="p-2 text-center text-xs text-muted-foreground">Loading…</div>
                  ) : diffFiles.length === 0 ? (
                    <div className="p-2 text-center text-xs text-muted-foreground">
                      No changes between {base} and {branch}
                    </div>
                  ) : (
                    diffFiles.map(([path, status]) => (
                      <Tooltip key={path}>
                        <TooltipTrigger asChild>
                          <div
                            className={cn(
                              "flex cursor-pointer select-none items-center gap-2 px-2 py-1 text-sm hover:bg-accent",
                              selectedFilePath === path && "bg-accent",
                            )}
                            onClick={() => setSelectedFilePath(path)}
                          >
                            <FileTypeIcon path={path} className="size-3.5 shrink-0" />
                            <FilePathLabel path={path} />
                            <FileStatusIcon status={status} className="size-3.5" />
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>{`${path} (${status})`}</TooltipContent>
                      </Tooltip>
                    ))
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <DiffView path={selectedFilePath} diff={selectedDiff} imageDiff={selectedImageDiff} />
                </div>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
                {branchCommitsLoading ? (
                  <div className="p-2 text-center text-xs text-muted-foreground">Loading…</div>
                ) : branchCommits.length === 0 ? (
                  <div className="p-2 text-center text-xs text-muted-foreground">
                    No commits between {base} and {branch}
                  </div>
                ) : (
                  branchCommits.map((commit) => (
                    <div
                      key={commit.oid}
                      className="flex items-center gap-2 border-b border-border/50 px-2 py-1.5 text-sm last:border-b-0"
                    >
                      <span className="min-w-0 flex-1 truncate">{commit.summary}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{commit.author_name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(commit.timestamp * 1000), { addSuffix: true })}
                      </span>
                      <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-secondary-foreground">
                        {commit.short_oid}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="flex w-56 shrink-0 flex-col gap-4 overflow-auto border-l border-border pl-4">
            <MultiSelectField
              label="Labels"
              placeholder="No labels"
              options={labels.map((l) => ({
                key: l.name,
                label: (
                  <span className="flex items-center gap-1.5">
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: `#${l.color}` }} />
                    {l.name}
                  </span>
                ),
              }))}
              selected={selectedLabels}
              onChange={setSelectedLabels}
            />
            <MultiSelectField
              label="Assignees"
              placeholder="No assignees"
              options={userOptions}
              selected={selectedAssignees}
              onChange={setSelectedAssignees}
            />
            <MultiSelectField
              label="Reviewers"
              placeholder="No reviewers"
              options={userOptions}
              selected={selectedReviewers}
              onChange={setSelectedReviewers}
            />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Milestone</span>
              <select
                value={selectedMilestone}
                onChange={(e) => setSelectedMilestone(e.target.value)}
                className={cn(
                  "h-7 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  !selectedMilestone && "text-muted-foreground",
                )}
              >
                <option value="">No milestone</option>
                {milestones.map((m) => (
                  <option key={m.number} value={m.number}>
                    {m.title}
                  </option>
                ))}
              </select>
            </div>
            {projects.length > 0 && (
              <MultiSelectField
                label="Projects"
                placeholder="No projects"
                options={projects.map((p) => ({ key: p.id, label: p.title }))}
                selected={selectedProjects}
                onChange={setSelectedProjects}
              />
            )}
          </div>
        </div>
        <DialogFooter className="sm:items-center sm:gap-4">
          <CheckboxGroup
            className="text-sm text-muted-foreground"
            checked={draft}
            onCheckedChange={(checked) => setDraft(checked === true)}
          >
            Create as draft
          </CheckboxGroup>
          <Button
            disabled={submitting || !title.trim()}
            onClick={() => void submit()}
            variant={draft ? "neutral" : "positive"}
          >
            {draft ? <GitPullRequestDraftIcon className="size-3.5" /> : <GitPullRequestCreateArrow className="size-3.5" />}
            {submitting ? "Creating…" : draft ? "Create Draft Pull Request" : "Create Pull Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
