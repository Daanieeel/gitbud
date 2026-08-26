import { useEffect, useState } from "react";
import { PlusIcon, SaveIcon, Trash2Icon } from "lucide-react";
import { Button } from "@gitbud/ui/button";
import { Input } from "@gitbud/ui/input";
import { Checkbox } from "@gitbud/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@gitbud/ui/dialog";
import { useRepoStore } from "@/store/useRepoStore";
import {
  useCreateWorkspace,
  useDeleteWorkspace,
  useUpdateWorkspace,
  useWorkspaces,
} from "@/hooks/queries/useWorkspaces";
import { cn } from "@gitbud/ui/utils";

interface WorkspaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const NEW_ID = "__new__";

export function WorkspaceDialog({ open, onOpenChange }: WorkspaceDialogProps) {
  const repos = useRepoStore((s) => s.repos);
  const { data: workspaces } = useWorkspaces();
  const createMutation = useCreateWorkspace();
  const updateMutation = useUpdateWorkspace();
  const removeMutation = useDeleteWorkspace();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const startNew = () => {
    setEditingId(NEW_ID);
    setName("");
    setSelected(new Set());
  };

  const startEdit = (id: string) => {
    const workspace = workspaces.find((w) => w.id === id);
    if (!workspace) return;
    setEditingId(id);
    setName(workspace.name);
    setSelected(new Set(workspace.repo_paths));
  };

  useEffect(() => {
    if (!open) setEditingId(null);
  }, [open]);

  const toggleRepo = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const save = async () => {
    if (!name.trim()) return;
    if (editingId === NEW_ID) {
      await createMutation.mutateAsync({ name, repoPaths: [...selected] });
    } else if (editingId) {
      await updateMutation.mutateAsync({ id: editingId, name, repoPaths: [...selected] });
    }
    setEditingId(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Workspaces</DialogTitle>
          <DialogDescription>
            Named groups of repos you can filter the sidebar to and batch-sync together, independent
            of the auto-derived owner grouping or sidebar sections.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-72 gap-4">
          <div className="flex w-40 shrink-0 flex-col gap-0.5">
            {workspaces.map((w) => (
              <button
                key={w.id}
                onClick={() => startEdit(w.id)}
                className={cn(
                  "flex items-center justify-between gap-1 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                  editingId === w.id && "bg-accent font-medium",
                )}
              >
                <span className="truncate">{w.name}</span>
                <span className="text-xs text-muted-foreground">{w.repo_paths.length}</span>
              </button>
            ))}
            <Button variant="ghost" size="sm" className="mt-1 justify-start" onClick={startNew}>
              <PlusIcon className="size-3.5" />
              New Workspace
            </Button>
          </div>
          <div className="min-w-0 flex-1 border-l border-border pl-4">
            {editingId === null ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Select a workspace to edit, or create a new one
              </div>
            ) : (
              <div className="flex h-full flex-col gap-3">
                <Input
                  autoFocus
                  placeholder="Workspace name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border p-1">
                  {repos.map((repo) => (
                    <div
                      key={repo.path}
                      className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-sm hover:bg-accent"
                      onClick={() => toggleRepo(repo.path)}
                    >
                      <Checkbox
                        checked={selected.has(repo.path)}
                        onClick={(e) => e.stopPropagation()}
                        onCheckedChange={() => toggleRepo(repo.path)}
                      />
                      {repo.name}
                    </div>
                  ))}
                </div>
                <div className="flex justify-between">
                  {editingId !== NEW_ID ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        void removeMutation.mutateAsync(editingId);
                        setEditingId(null);
                      }}
                    >
                      <Trash2Icon className="size-3.5" />
                      Delete
                    </Button>
                  ) : (
                    <span />
                  )}
                  <Button size="sm" disabled={!name.trim()} onClick={() => void save()}>
                    <SaveIcon className="size-3.5" />
                    Save
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
