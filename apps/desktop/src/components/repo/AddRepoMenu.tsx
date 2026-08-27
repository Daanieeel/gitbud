import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { DownloadIcon, FolderOpenIcon, FolderPlusIcon, PlusIcon } from "lucide-react";
import { Button } from "@gitbud/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@gitbud/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@gitbud/ui/tooltip";
import { CloneDialog } from "./CloneDialog";
import { CreateRepoDialog } from "./CreateRepoDialog";
import { useRepoStore } from "@/store/useRepoStore";
import { isSinglePath } from "@/lib/dialogPaths";

export function AddRepoMenu() {
  const [cloneOpen, setCloneOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const cloneRepo = useRepoStore((s) => s.cloneRepo);
  const addExistingRepo = useRepoStore((s) => s.addExistingRepo);
  const createNewRepo = useRepoStore((s) => s.createNewRepo);

  const addExisting = async () => {
    const dir = await open({ directory: true, title: "Add Existing Repository" });
    if (isSinglePath(dir)) await addExistingRepo(dir);
  };

  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="icon">
                <PlusIcon />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Add repository</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => setCloneOpen(true)}>
            <DownloadIcon className="size-3.5" />
            Clone Repository…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
            <FolderPlusIcon className="size-3.5" />
            Create New Repository…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void addExisting()}>
            <FolderOpenIcon className="size-3.5" />
            Add Existing Repository…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CloneDialog open={cloneOpen} onOpenChange={setCloneOpen} onClone={cloneRepo} />
      <CreateRepoDialog open={createOpen} onOpenChange={setCreateOpen} onCreate={createNewRepo} />
    </>
  );
}
