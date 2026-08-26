import { useMemo, useState } from "react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { PlusCircleIcon } from "lucide-react";
import { Input } from "@gitbud/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@gitbud/ui/popover";
import { CUSTOM_EDITOR_ID, EDITORS, MANUFACTURER_ORDER } from "@/lib/editors";

interface EditorPickerProps {
  /** Called with the chosen editor id, or `CUSTOM_EDITOR_ID` + the picked app's absolute path. */
  onSelect: (editorId: string, customAppPath?: string) => void;
  children: React.ReactNode;
}

/** A searchable, manufacturer-grouped popover for picking a favorite editor — the trigger
 * (`children`) is caller-supplied so this can be a compact settings-row select or a prominent
 * call-to-action button, with identical picking behavior either way. */
export function EditorPicker({ onSelect, children }: EditorPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

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

  const pickCustom = async () => {
    setOpen(false);
    setSearch("");
    const appPath = await openFileDialog({
      title: "Choose Editor Application",
      multiple: false,
    });
    if (typeof appPath !== "string") return;
    onSelect(CUSTOM_EDITOR_ID, appPath);
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
              onClick={() => void pickCustom()}
            >
              <PlusCircleIcon className="size-4 shrink-0" />
              Choose Custom Editor App...
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
