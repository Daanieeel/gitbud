import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2Icon,
  CircleDashedIcon,
  ExternalLinkIcon,
  GitMergeIcon,
  TriangleAlertIcon,
  XCircleIcon,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CheckboxGroup } from "@/components/ui/checkbox-group";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePRStore } from "@/store/usePRStore";
import { api } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import type { CheckRun, PullRequest, RepoMergeSettings } from "@/lib/types";

interface MergePRDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoPath: string;
  login: string;
  pr: PullRequest;
}

const METHODS: {
  key: "merge" | "squash" | "rebase";
  label: string;
  description: string;
  allowed: keyof RepoMergeSettings;
}[] = [
  {
    key: "merge",
    label: "Merge commit",
    description: "All commits added via a merge commit",
    allowed: "allow_merge_commit",
  },
  {
    key: "squash",
    label: "Squash and merge",
    description: "Commits combined into one commit",
    allowed: "allow_squash_merge",
  },
  {
    key: "rebase",
    label: "Rebase and merge",
    description: "Commits rebased onto the base branch",
    allowed: "allow_rebase_merge",
  },
];

function runIcon(run: CheckRun) {
  if (run.status !== "completed") return <CircleDashedIcon className="size-3.5 shrink-0 text-accent-yellow" />;
  if (run.conclusion && ["success", "neutral", "skipped"].includes(run.conclusion)) {
    return <CheckCircle2Icon className="size-3.5 shrink-0 text-accent-green" />;
  }
  return <XCircleIcon className="size-3.5 shrink-0 text-accent-pink" />;
}

export function MergePRDialog({ open, onOpenChange, repoPath, login, pr }: MergePRDialogProps) {
  const mergePR = usePRStore((s) => s.mergePR);

  const [method, setMethod] = useState<"merge" | "squash" | "rebase">("squash");
  const [commitTitle, setCommitTitle] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [deleteBranch, setDeleteBranch] = useState(false);
  const [merging, setMerging] = useState(false);
  const [runs, setRuns] = useState<CheckRun[] | null>(null);
  const [repoSettings, setRepoSettings] = useState<RepoMergeSettings | null>(null);

  // Reset per-open state right at the moment the dialog opens, mirroring CreatePRDialog.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setCommitTitle(`${pr.title} (#${pr.number})`);
      setCommitMessage("");
      setRepoSettings(null);
    }
    wasOpenRef.current = open;
  }, [open, pr.title, pr.number]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void api.githubListCheckRuns(repoPath, login, pr.head_sha).then(
      (result) => !cancelled && setRuns(result),
      () => !cancelled && setRuns([]),
    );
    return () => {
      cancelled = true;
    };
  }, [open, repoPath, login, pr.head_sha]);

  // Only offer merge methods this repo actually allows (GitHub 405s on a disallowed one), and
  // start the "delete branch" checkbox at the repo's own default for it rather than always off.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void api.githubGetRepoMergeSettings(repoPath, login).then((settings) => {
      if (cancelled) return;
      setRepoSettings(settings);
      setDeleteBranch(settings.delete_branch_on_merge);
      setMethod((prev) => {
        const isAllowed = (key: typeof prev) => settings[METHODS.find((m) => m.key === key)!.allowed];
        return isAllowed(prev) ? prev : (METHODS.find((m) => settings[m.allowed])?.key ?? prev);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [open, repoPath, login]);

  const submit = async () => {
    setMerging(true);
    try {
      await mergePR(repoPath, login, pr.number, method, commitTitle, commitMessage, pr.head_sha, deleteBranch, pr.head_ref);
      onOpenChange(false);
    } finally {
      setMerging(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex w-[36rem] max-w-none flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMergeIcon className="size-4 shrink-0" />
            <span className="truncate">
              {pr.title} <span className="text-muted-foreground">#{pr.number}</span>
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="text-sm text-muted-foreground">
            {pr.head_ref} → {pr.base_ref}
          </div>

          {pr.mergeable === false && (
            <div className="flex items-center gap-1.5 rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
              <TriangleAlertIcon className="size-3.5 shrink-0" />
              This branch has conflicts with {pr.base_ref} and may not be mergeable.
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Checks</span>
            <div className="flex flex-col gap-1 rounded-md border border-border p-3 text-xs">
              {runs === null ? (
                <div className="flex flex-col gap-1.5 py-0.5">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <Skeleton className="size-3.5 shrink-0 rounded-full" />
                      <Skeleton className="h-3 w-32" />
                      <Skeleton className="ml-auto h-3 w-14" />
                    </div>
                  ))}
                </div>
              ) : runs.length === 0 ? (
                <span className="text-muted-foreground">No checks reported</span>
              ) : (
                <div className="flex max-h-40 flex-col gap-1.5 overflow-auto">
                  {runs.map((r) => (
                    <a
                      key={r.name}
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        void openUrl(r.html_url);
                      }}
                      className="flex items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-accent"
                    >
                      {runIcon(r)}
                      <span className="min-w-0 flex-1 truncate">{r.name}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {r.status === "completed" ? r.conclusion : r.status}
                      </span>
                      <ExternalLinkIcon className="size-3 shrink-0 text-muted-foreground" />
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Merge method</span>
            <div className="flex gap-2">
              {METHODS.map((m) => {
                const allowed = repoSettings ? repoSettings[m.allowed] : true;
                return (
                  <button
                    key={m.key}
                    type="button"
                    disabled={!allowed}
                    title={allowed ? undefined : "Disabled by this repository's merge settings"}
                    className={cn(
                      "flex-1 rounded-md border border-border p-2 text-left",
                      !allowed && "cursor-not-allowed opacity-40",
                      method === m.key && "border-2 border-primary bg-primary/10 p-[7px]",
                    )}
                    onClick={() => setMethod(m.key)}
                  >
                    <div className="flex flex-col gap-1">
                      <div className="text-sm font-medium">{m.label}</div>
                      <div className="text-xs text-muted-foreground">{m.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <Input
            placeholder="Commit title"
            value={commitTitle}
            onChange={(e) => setCommitTitle(e.target.value)}
            autoComplete="off"
          />
          <Textarea
            placeholder="Extra description (optional — leave blank for GitHub's default)"
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            rows={3}
            autoComplete="off"
          />
        </div>
        <DialogFooter className="sm:items-center sm:gap-4">
          <CheckboxGroup
            className="text-sm text-muted-foreground"
            checked={deleteBranch}
            onCheckedChange={(checked) => setDeleteBranch(checked === true)}
          >
            Delete branch after merge
          </CheckboxGroup>
          <Button disabled={merging || !commitTitle.trim()} onClick={() => void submit()}>
            <GitMergeIcon className="size-3.5" />
            {merging ? "Merging…" : METHODS.find((m) => m.key === method)?.label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
