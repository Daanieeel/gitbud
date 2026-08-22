import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { DownloadIcon, FolderOpenIcon, FolderPlusIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CloneDialog } from "./CloneDialog";
import { useRepoStore } from "@/store/useRepoStore";

export function AddRepoMenu() {
  const [cloneOpen, setCloneOpen] = useState(false);
  const cloneRepo = useRepoStore((s) => s.cloneRepo);
  const addExistingRepo = useRepoStore((s) => s.addExistingRepo);
  const createNewRepo = useRepoStore((s) => s.createNewRepo);

  const addExisting = async () => {
    const dir = await open({ directory: true, title: "Add Existing Repository" });
    if (typeof dir === "string") await addExistingRepo(dir);
  };

  const createNew = async () => {
    const dir = await open({ directory: true, title: "Choose a folder to initialize as a repository" });
    if (typeof dir === "string") await createNewRepo(dir);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" title="Add repository">
            <PlusIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => setCloneOpen(true)}>
            <DownloadIcon className="size-3.5" />
            Clone Repository…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void createNew()}>
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
    </>
  );
}
