import { useEffect, useState } from "react";
import { ArchiveIcon, Trash2Icon, Undo2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useRepoStore } from "@/store/useRepoStore";
import { useStashStore } from "@/store/useStashStore";

interface StashPanelProps {
  hasChanges: boolean;
}

export function StashPanel({ hasChanges }: StashPanelProps) {
  const repoPath = useRepoStore((s) => s.selectedRepo);
  const refreshStatus = useRepoStore((s) => s.refreshStatus);
  const stashes = useStashStore((s) => s.stashes);
  const load = useStashStore((s) => s.load);
  const save = useStashStore((s) => s.save);
  const apply = useStashStore((s) => s.apply);
  const pop = useStashStore((s) => s.pop);
  const drop = useStashStore((s) => s.drop);

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && repoPath) void load(repoPath);
  }, [open, repoPath, load]);

  if (!repoPath) return null;

  const doSave = async () => {
    setSaving(true);
    try {
      await save(repoPath, "", true);
      await refreshStatus();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" title="Stash uncommitted changes, or apply a saved stash">
          <ArchiveIcon className="size-3.5" />
          Stash{stashes.length > 0 ? ` (${stashes.length})` : ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="border-b border-border p-2">
          <Button
            size="sm"
            className="w-full"
            disabled={!hasChanges || saving}
            onClick={() => void doSave()}
          >
            Stash All Changes
          </Button>
        </div>
        <div className="max-h-64 overflow-auto p-1">
          {stashes.length === 0 && (
            <div className="p-3 text-center text-sm text-muted-foreground">No stashes</div>
          )}
          {stashes.map((s) => (
            <div
              key={s.index}
              className="group flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
            >
              <span className="min-w-0 flex-1 truncate" title={s.message}>
                {s.message}
              </span>
              <button
                title="Apply (keep stash)"
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                onClick={() =>
                  void apply(repoPath, s.index).then(() => refreshStatus())
                }
              >
                <Undo2Icon className="size-3.5" />
              </button>
              <button
                title="Pop (apply and remove)"
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                onClick={() => void pop(repoPath, s.index).then(() => refreshStatus())}
              >
                <ArchiveIcon className="size-3.5" />
              </button>
              <button
                title="Drop"
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                onClick={() => void drop(repoPath, s.index)}
              >
                <Trash2Icon className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
