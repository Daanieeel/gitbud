import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { homeDir } from "@tauri-apps/api/path";
import { FolderPlusIcon } from "lucide-react";
import { Button } from "@gitbud/ui/button";
import { Input } from "@gitbud/ui/input";
import { CheckboxGroup } from "@gitbud/ui/checkbox-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@gitbud/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@gitbud/ui/select";
import { api } from "@/lib/tauri";
import { isSinglePath } from "@/lib/dialogPaths";
import { buildGitignore } from "@/lib/gitignore-templates";
import { LICENSE_TEMPLATES } from "@/lib/license-templates";
import { DestinationField } from "./DestinationField";
import { GitignorePicker } from "@/components/gitignore/GitignorePicker";

interface CreateRepoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (
    path: string,
    defaultBranch?: string,
    files?: { name: string; contents: string }[],
  ) => Promise<void>;
}

export function CreateRepoDialog({ open: isOpen, onOpenChange, onCreate }: CreateRepoDialogProps) {
  const [repoName, setRepoName] = useState("");
  const [branchName, setBranchName] = useState("");
  const [parentDir, setParentDir] = useState<string | null>(null);
  const [destPath, setDestPath] = useState("");
  const [destEdited, setDestEdited] = useState(false);
  const [addReadme, setAddReadme] = useState(true);
  const [gitignoreSelected, setGitignoreSelected] = useState<string[]>([]);
  const [licenseId, setLicenseId] = useState<string>("");
  const [identity, setIdentity] = useState<{ name: string | null }>({ name: null });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    void homeDir().then((dir) => setParentDir((prev) => prev ?? dir));
    void api.getGlobalGitIdentity().then(([name]) => setIdentity({ name }));
  }, [isOpen]);

  useEffect(() => {
    if (parentDir && !destEdited) {
      setDestPath(repoName.trim() ? `${parentDir}/${repoName.trim()}` : parentDir);
    }
  }, [parentDir, repoName, destEdited]);

  const reset = () => {
    setRepoName("");
    setBranchName("");
    setParentDir(null);
    setDestPath("");
    setDestEdited(false);
    setAddReadme(true);
    setGitignoreSelected([]);
    setLicenseId("");
  };

  const pickParentDir = async () => {
    const dir = await open({ directory: true, title: "Choose where to create the repository" });
    if (!isSinglePath(dir)) return;
    setParentDir(dir);
    setDestEdited(false);
  };

  const disabled = !repoName.trim() || !destPath.trim() || creating;

  const submit = async () => {
    if (!repoName.trim() || !destPath.trim()) return;
    setCreating(true);
    try {
      const files: { name: string; contents: string }[] = [];
      if (addReadme) {
        files.push({ name: "README.md", contents: `# ${repoName.trim()}\n` });
      }
      if (gitignoreSelected.length > 0) {
        files.push({ name: ".gitignore", contents: buildGitignore(gitignoreSelected) });
      }
      const license = LICENSE_TEMPLATES.find((l) => l.id === licenseId);
      if (license) {
        files.push({
          name: "LICENSE",
          contents: license.content(identity.name ?? "", new Date().getFullYear()),
        });
      }
      await onCreate(destPath.trim(), branchName.trim() || "main", files);
      reset();
      onOpenChange(false);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create New Repository</DialogTitle>
          <DialogDescription>Sets up a new git repository on your machine.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Name <span className="text-destructive">*</span>
              </span>
              <Input
                placeholder="my-project"
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex w-36 shrink-0 flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Default branch</span>
              <Input
                placeholder="main"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Destination <span className="text-destructive">*</span>
            </span>
            <DestinationField
              value={destPath}
              onChange={(v) => {
                setDestPath(v);
                setDestEdited(true);
              }}
              onBrowse={() => void pickParentDir()}
              placeholder="Destination folder"
            />
          </div>

          <CheckboxGroup
            checked={addReadme}
            onCheckedChange={(checked) => setAddReadme(checked === true)}
            className="text-sm"
          >
            Initialize a README file
          </CheckboxGroup>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">.gitignore</span>
            <GitignorePicker
              selected={gitignoreSelected}
              onChange={setGitignoreSelected}
              className="w-full"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">License</span>
            <Select value={licenseId} onValueChange={setLicenseId}>
              <SelectTrigger className="w-full border-input bg-accent font-normal hover:bg-accent/80 hover:text-accent-foreground">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                {LICENSE_TEMPLATES.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button disabled={disabled} onClick={() => void submit()}>
            <FolderPlusIcon className="size-3.5" />
            {creating ? "Creating…" : "Create Repository"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
