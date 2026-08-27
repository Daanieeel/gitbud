import { useEffect, useState } from "react";
import { FolderOpenIcon, FolderPlusIcon } from "lucide-react";
import { Button } from "@gitbud/ui/button";
import { Input } from "@gitbud/ui/input";
import { api } from "@/lib/tauri";

interface DestinationFieldProps {
  value: string;
  onChange: (value: string) => void;
  onBrowse: () => void;
  placeholder?: string;
}

/** Editable destination-folder input plus a browse button, shared by the clone and create-repo
 * dialogs. Below the input, a small note appears once the typed/picked path doesn't exist yet
 * on disk, since in both flows that's expected (git/the app creates the folder), not an error. */
export function DestinationField({
  value,
  onChange,
  onBrowse,
  placeholder = "Destination folder",
}: DestinationFieldProps) {
  const [exists, setExists] = useState(true);

  useEffect(() => {
    const path = value.trim();
    if (!path) {
      setExists(true);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void api.pathExists(path).then((found) => {
        if (!cancelled) setExists(found);
      });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value]);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 font-mono text-xs"
        />
        <Button variant="secondary" size="sm" onClick={onBrowse}>
          <FolderOpenIcon className="size-3.5" />
          Browse
        </Button>
      </div>
      {value.trim() && !exists && (
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <FolderPlusIcon className="size-3.5 shrink-0" />
          Folder will be created
        </span>
      )}
    </div>
  );
}
