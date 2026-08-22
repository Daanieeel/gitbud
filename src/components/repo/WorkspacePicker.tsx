import { useEffect, useState } from "react";
import { ChevronDownIcon, FolderKanbanIcon, SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { WorkspaceDialog } from "./WorkspaceDialog";
import { cn } from "@/lib/utils";

export function WorkspacePicker() {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeId = useWorkspaceStore((s) => s.activeId);
  const setActive = useWorkspaceStore((s) => s.setActive);
  const init = useWorkspaceStore((s) => s.init);
  const [manageOpen, setManageOpen] = useState(false);

  useEffect(() => {
    void init();
  }, [init]);

  const active = workspaces.find((w) => w.id === activeId);

  if (workspaces.length === 0) {
    return (
      <>
        <Button variant="ghost" size="sm" className="h-6 justify-start px-1 text-xs text-muted-foreground" onClick={() => setManageOpen(true)}>
          <FolderKanbanIcon className="size-3" />
          New Workspace…
        </Button>
        <WorkspaceDialog open={manageOpen} onOpenChange={setManageOpen} />
      </>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-6 justify-start gap-1 px-1 text-xs">
            <FolderKanbanIcon className="size-3" />
            <span className={cn("truncate", !active && "text-muted-foreground")}>
              {active ? active.name : "All Repos"}
            </span>
            <ChevronDownIcon className="size-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => setActive(null)}>All Repos</DropdownMenuItem>
          <DropdownMenuSeparator />
          {workspaces.map((w) => (
            <DropdownMenuItem key={w.id} onSelect={() => setActive(w.id)}>
              {w.name}
              <span className="ml-auto text-xs text-muted-foreground">{w.repo_paths.length}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setManageOpen(true)}>
            <SettingsIcon className="size-3.5" />
            Manage Workspaces…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <WorkspaceDialog open={manageOpen} onOpenChange={setManageOpen} />
    </>
  );
}
