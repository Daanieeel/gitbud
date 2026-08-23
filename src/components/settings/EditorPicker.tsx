import { useMemo, useState } from "react";
import { PlusCircleIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CUSTOM_EDITOR_ID, EDITORS, MANUFACTURER_ORDER } from "@/lib/editors";
import { cn } from "@/lib/utils";

interface EditorPickerProps {
  /** Called with the chosen editor id, or `CUSTOM_EDITOR_ID` + the entered command template. */
  onSelect: (editorId: string, customCommand?: string) => void;
  children: React.ReactNode;
}

/** A searchable, manufacturer-grouped popover for picking a favorite editor — the trigger
 * (`children`) is caller-supplied so this can be a compact settings-row select or a prominent
 * call-to-action button, with identical picking behavior either way. */
export function EditorPicker({ onSelect, children }: EditorPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [customCommand, setCustomCommand] = useState("");

  const groups = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const matches = EDITORS.filter((e) => !needle || e.name.toLowerCase().includes(needle));
    return MANUFACTURER_ORDER.map((manufacturer) => ({
      manufacturer,
      editors: matches.filter((e) => e.manufacturer === manufacturer),
    })).filter((g) => g.editors.length > 0);
  }, [search]);

  const pick = (editorId: string) => {
    onSelect(editorId);
    setOpen(false);
    setSearch("");
  };

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSearch("");
        }}
      >
        <PopoverTrigger asChild>{children}</PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <div className="border-b border-border p-2">
            <Input
              autoFocus
              placeholder="Search editors…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7"
            />
          </div>
          <div
            className="max-h-72 overflow-auto p-1"
            // The settings dialog this trigger normally lives in is a modal Dialog, whose
            // scroll lock only recognizes scrollable elements it can find nested inside its own
            // content — this popover is portalled straight to `body`, a DOM sibling of it
            // rather than a descendant, so the lock swallows wheel events over it and native
            // scrolling silently does nothing. Scroll it manually instead of relying on that.
            onWheel={(e) => {
              e.currentTarget.scrollTop += e.deltaY;
              e.stopPropagation();
            }}
          >
            {groups.length === 0 && (
              <div className="p-3 text-center text-xs text-muted-foreground">No matches</div>
            )}
            {groups.map((group) => (
              <div key={group.manufacturer} className="mb-1 last:mb-0">
                <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {group.manufacturer}
                </div>
                {group.editors.map((editor) => (
                  <button
                    key={editor.id}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                    onClick={() => pick(editor.id)}
                  >
                    <img src={editor.icon} alt="" className="size-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{editor.name}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
          <div className="border-t border-border p-1">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => {
                setOpen(false);
                setCustomCommand("");
                setCustomOpen(true);
              }}
            >
              <PlusCircleIcon className="size-4 shrink-0" />
              Configure Custom Editor...
            </button>
          </div>
        </PopoverContent>
      </Popover>
      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Configure Custom Editor</DialogTitle>
            <DialogDescription>
              A shell command to launch your editor. Use <code>{"{path}"}</code> as a placeholder
              for the file's path.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="subl {path}"
            value={customCommand}
            onChange={(e) => setCustomCommand(e.target.value)}
            className={cn("font-mono")}
            autoComplete="off"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCustomOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!customCommand.trim()}
              onClick={() => {
                onSelect(CUSTOM_EDITOR_ID, customCommand.trim());
                setCustomOpen(false);
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
