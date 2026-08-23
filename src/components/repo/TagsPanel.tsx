import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { PlusIcon, TagIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRepoStore } from "@/store/useRepoStore";
import { useCreateTag, useDeleteTag, usePushTag, useTags } from "@/hooks/queries/useTags";
import { githubRepoUrl } from "@/lib/github-links";
import { cn } from "@/lib/utils";

export function TagsPanel() {
  const repoPath = useRepoStore((s) => s.selectedRepo);
  const [open, setOpen] = useState(false);
  const { data: tags } = useTags(repoPath, open);
  const createTag = useCreateTag(repoPath);
  const deleteTag = useDeleteTag(repoPath);
  const pushTag = usePushTag(repoPath);
  const [newName, setNewName] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const busy = busyKey !== null;

  if (!repoPath) return null;

  const runBusy = async (key: string, fn: () => Promise<void>) => {
    const startedAt = Date.now();
    setBusyKey(key);
    try {
      await fn();
    } finally {
      const elapsed = Date.now() - startedAt;
      if (elapsed < 400) await new Promise((resolve) => setTimeout(resolve, 400 - elapsed));
      setBusyKey(null);
    }
  };

  const create = () =>
    runBusy("create", async () => {
      if (!newName.trim()) return;
      await createTag.mutateAsync({ name: newName.trim(), message: newMessage.trim() });
      setNewName("");
      setNewMessage("");
    });

  const remove = (name: string) =>
    runBusy(`${name}:delete`, async () => {
      await deleteTag.mutateAsync(name);
    });

  const push = (name: string) => runBusy(`${name}:push`, () => pushTag.mutateAsync(name));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="secondary" size="sm">
              <TagIcon className="size-3.5" />
              {tags.length > 0 ? tags.length : ""}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Tags</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="max-h-56 overflow-auto p-1">
          {tags.length === 0 && (
            <div className="p-3 text-center text-sm text-muted-foreground">No tags</div>
          )}
          {tags.map((t) => (
            <div key={t.name} className="group flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="min-w-0 flex-1 truncate font-mono">
                    {t.name}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{t.message ?? undefined}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      void githubRepoUrl(repoPath).then((base) => {
                        if (base) void openUrl(`${base}/releases/tag/${t.name}`);
                      })
                    }
                  >
                    <TagIcon className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Open on GitHub</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    disabled={busy}
                    className={cn(
                      "text-muted-foreground hover:text-foreground disabled:opacity-50",
                      busyKey === `${t.name}:push` ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                    )}
                    onClick={() => void push(t.name)}
                  >
                    <UploadIcon className={cn("size-3.5", busyKey === `${t.name}:push` && "animate-spin")} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Push tag to origin</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    disabled={busy}
                    className={cn(
                      "text-muted-foreground hover:text-destructive disabled:opacity-50",
                      busyKey === `${t.name}:delete` ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                    )}
                    onClick={() => void remove(t.name)}
                  >
                    <Trash2Icon className={cn("size-3.5", busyKey === `${t.name}:delete` && "animate-spin")} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Delete tag</TooltipContent>
              </Tooltip>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2 border-t border-border p-2">
          <Input placeholder="Tag name (e.g. v1.0.0)" value={newName} onChange={(e) => setNewName(e.target.value)} className="h-7" />
          <Input placeholder="Message (optional, annotated tag)" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} className="h-7" />
          <Button size="sm" disabled={!newName.trim() || busy} onClick={() => void create()}>
            <PlusIcon className={cn("size-3.5", busyKey === "create" && "animate-spin")} />
            {busyKey === "create" ? "Creating…" : "Create Tag on HEAD"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
