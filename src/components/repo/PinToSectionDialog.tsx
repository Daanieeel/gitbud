import { useState } from "react";
import { CheckIcon, FolderInputIcon, PinIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { RepoEntry } from "@/lib/types";

interface PinToSectionDialogProps {
  repo: RepoEntry | null;
  sections: string[];
  onOpenChange: (open: boolean) => void;
  onAddSection: (section: string) => void;
  onRemoveSection: (section: string) => void;
}

export function PinToSectionDialog({
  repo,
  sections,
  onOpenChange,
  onAddSection,
  onRemoveSection,
}: PinToSectionDialogProps) {
  const [newSection, setNewSection] = useState("");

  const create = () => {
    if (!newSection.trim()) return;
    onAddSection(newSection.trim());
    setNewSection("");
  };

  return (
    <Dialog
      open={repo !== null}
      onOpenChange={(open) => {
        if (!open) setNewSection("");
        onOpenChange(open);
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Pin "{repo?.name}" to Section</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          A repository can be pinned to any number of sections for quick access. It still shows
          up under its own organization, too.
        </p>
        <div className="flex max-h-48 flex-col gap-0.5 overflow-auto">
          {sections.length === 0 && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">No sections yet</p>
          )}
          {sections.map((s) => {
            const pinned = !!repo?.sections.includes(s);
            return (
              <button
                key={s}
                className={cn(
                  "flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                  pinned && "font-medium",
                )}
                onClick={() => (pinned ? onRemoveSection(s) : onAddSection(s))}
              >
                {s}
                {pinned && <CheckIcon className="size-3.5 shrink-0" />}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2 border-t border-border pt-3">
          <Input
            autoFocus
            placeholder="New section name"
            value={newSection}
            onChange={(e) => setNewSection(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
          <Button size="sm" disabled={!newSection.trim()} onClick={create}>
            <FolderInputIcon className="size-3.5" />
            Create
          </Button>
        </div>
        <DialogFooter>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <PinIcon className="size-3" />
            Pinned sections appear at the top of the sidebar
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
