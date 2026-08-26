import { useState } from "react";
import { ChevronDownIcon, FolderKanbanIcon, SettingsIcon } from "lucide-react";
import { Button } from "@gitbud/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@gitbud/ui/dropdown-menu";
import { useWorkspaces } from "@/hooks/queries/useWorkspaces";
import { useWorkspaceFilterStore } from "@/store/useWorkspaceFilterStore";
import { WorkspaceDialog } from "./WorkspaceDialog";
import { cn } from "@gitbud/ui/utils";

export function WorkspacePicker() {
  const { data: workspaces } = useWorkspaces();
  const activeId = useWorkspaceFilterStore((s) => s.activeId);
  const setActive = useWorkspaceFilterStore((s) => s.setActive);
  const [manageOpen, setManageOpen] = useState(false);

  const active = workspaces.find((w) => w.id === activeId);

  if (workspaces.length === 0) {
    return null;
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
