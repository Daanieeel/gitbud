import { useState } from "react";
import { FolderInputIcon, PinIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { RepoEntry } from "@/lib/types";

interface PinToSectionDialogProps {
  repo: RepoEntry | null;
  sections: string[];
  onOpenChange: (open: boolean) => void;
  onPin: (section: string | null) => void;
}

export function PinToSectionDialog({ repo, sections, onOpenChange, onPin }: PinToSectionDialogProps) {
  const [newSection, setNewSection] = useState("");

  const pin = (section: string | null) => {
    onPin(section);
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
          Pinning adds this repository to a section for quick access. It still shows up under
          its own organization, too.
        </p>
        <div className="flex max-h-48 flex-col gap-0.5 overflow-auto">
          <button
            className={cn(
              "rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
              !repo?.section && "bg-accent font-medium",
            )}
            onClick={() => pin(null)}
          >
            No section
          </button>
          {sections.map((s) => (
            <button
              key={s}
              className={cn(
                "rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                repo?.section === s && "bg-accent font-medium",
              )}
              onClick={() => pin(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex gap-2 border-t border-border pt-3">
          <Input
            autoFocus
            placeholder="New section name"
            value={newSection}
            onChange={(e) => setNewSection(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && newSection.trim() && pin(newSection.trim())}
          />
          <Button size="sm" disabled={!newSection.trim()} onClick={() => pin(newSection.trim())}>
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
