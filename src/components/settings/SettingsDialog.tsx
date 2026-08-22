import { useEffect, useState } from "react";
import {
  ColumnsIcon,
  DownloadIcon,
  GitBranchIcon,
  PanelLeftIcon,
  SaveIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  UploadIcon,
} from "lucide-react";
import { save, open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GitHubMark } from "@/components/github/GitHubMark";
import { UpdateChecker } from "./UpdateChecker";
import { SigningWizard } from "./SigningWizard";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useGitHubStore } from "@/store/useGitHubStore";
import { useRepoStore } from "@/store/useRepoStore";
import { api } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import type { DiffViewMode, PullStrategy, SidebarSort, ThemeMode } from "@/lib/types";

const SECTIONS = [
  { key: "General", icon: SettingsIcon },
  { key: "Git", icon: GitBranchIcon },
  { key: "Diff", icon: ColumnsIcon },
  { key: "Sidebar", icon: PanelLeftIcon },
  { key: "GitHub", icon: GitHubMark },
  { key: "Advanced", icon: SlidersHorizontalIcon },
] as const;
type Section = (typeof SECTIONS)[number]["key"];

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function Select<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className="h-8 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { settings, update, exportTo, importFrom } = useSettingsStore();
  const [importExportError, setImportExportError] = useState<string | null>(null);
  const clientId = useGitHubStore((s) => s.clientId);
  const setClientId = useGitHubStore((s) => s.setClientId);
  const repoPath = useRepoStore((s) => s.selectedRepo);

  const [section, setSection] = useState<Section>("General");
  const [host, setHost] = useState("github.com");
  const [gitName, setGitName] = useState("");
  const [gitEmail, setGitEmail] = useState("");
  const [gitScope, setGitScope] = useState<"global" | "repo">("global");

  useEffect(() => {
    if (!open) return;
    void api.githubGetHost().then(setHost);
    if (repoPath) {
      void api.getGitIdentity(repoPath).then(([name, email]) => {
        setGitName(name ?? "");
        setGitEmail(email ?? "");
      });
    }
  }, [open, repoPath]);

  const saveGitIdentity = async () => {
    if (!repoPath) return;
    await api.setGitIdentity(repoPath, gitName, gitEmail, gitScope === "global");
  };

  const exportSettings = async () => {
    setImportExportError(null);
    try {
      const dest = await save({
        title: "Export GitBud Settings",
        defaultPath: "gitbud-settings.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (dest) await exportTo(dest);
    } catch (e) {
      setImportExportError(String(e));
    }
  };

  const importSettings = async () => {
    setImportExportError(null);
    try {
      const src = await openFileDialog({
        title: "Import GitBud Settings",
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (typeof src === "string") await importFrom(src);
    } catch (e) {
      setImportExportError(String(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-80 gap-4">
          <div className="flex w-32 shrink-0 flex-col gap-0.5">
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSection(s.key)}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                  section === s.key && "bg-accent font-medium",
                )}
              >
                <s.icon className="size-3.5 shrink-0" />
                {s.key}
              </button>
            ))}
          </div>
          <div className="min-w-0 flex-1 divide-y divide-border">
            {section === "General" && (
              <>
                <Row label="Theme">
                  <Select
                    value={settings.theme}
                    options={["dark", "light", "system"] as ThemeMode[]}
                    onChange={(theme) => void update({ theme })}
                  />
                </Row>
                <Row label="Default clone directory">
                  <Input
                    className="h-8 w-56"
                    placeholder="~/Developer"
                    value={settings.default_clone_dir ?? ""}
                    onChange={(e) => void update({ default_clone_dir: e.target.value || null })}
                  />
                </Row>
                <Row label="Desktop notifications">
                  <Checkbox
                    checked={settings.desktop_notifications}
                    onCheckedChange={(checked) => void update({ desktop_notifications: checked === true })}
                  />
                </Row>
              </>
            )}

            {section === "Git" && (
              <>
                <Row label="Name">
                  <Input className="h-8 w-56" value={gitName} onChange={(e) => setGitName(e.target.value)} />
                </Row>
                <Row label="Email">
                  <Input className="h-8 w-56" value={gitEmail} onChange={(e) => setGitEmail(e.target.value)} />
                </Row>
                <Row label="Apply to">
                  <Select
                    value={gitScope}
                    options={["global", "repo"] as const}
                    onChange={setGitScope}
                  />
                </Row>
                <div className="flex justify-end py-2">
                  <Button size="sm" onClick={() => void saveGitIdentity()}>
                    <SaveIcon className="size-3.5" />
                    Save Identity
                  </Button>
                </div>
                <div className="py-2">
                  <SigningWizard
                    repoPath={repoPath}
                    name={gitName}
                    email={gitEmail}
                    global={gitScope === "global"}
                  />
                </div>
                <Row label="Default branch name">
                  <Input
                    className="h-8 w-32"
                    value={settings.default_branch_name}
                    onChange={(e) => void update({ default_branch_name: e.target.value })}
                  />
                </Row>
                <Row label="Pull strategy">
                  <Select
                    value={settings.pull_strategy}
                    options={["merge", "rebase", "ff-only"] as PullStrategy[]}
                    onChange={(pull_strategy) => void update({ pull_strategy })}
                  />
                </Row>
              </>
            )}

            {section === "Diff" && (
              <>
                <Row label="View">
                  <Select
                    value={settings.diff_view}
                    options={["unified", "split"] as DiffViewMode[]}
                    onChange={(diff_view) => void update({ diff_view })}
                  />
                </Row>
                <Row label="Ignore whitespace">
                  <Checkbox
                    checked={settings.ignore_whitespace}
                    onCheckedChange={(checked) => void update({ ignore_whitespace: checked === true })}
                  />
                </Row>
                <Row label="Font size">
                  <Input
                    type="number"
                    className="h-8 w-20"
                    value={settings.diff_font_size}
                    onChange={(e) => void update({ diff_font_size: Number(e.target.value) || 12 })}
                  />
                </Row>
              </>
            )}

            {section === "Sidebar" && (
              <>
                <Row label="Show ahead/behind badges">
                  <Checkbox
                    checked={settings.show_ahead_behind}
                    onCheckedChange={(checked) => void update({ show_ahead_behind: checked === true })}
                  />
                </Row>
                <Row label="Sort repos by">
                  <Select
                    value={settings.sidebar_sort}
                    options={["group", "name", "recent", "manual"] as SidebarSort[]}
                    onChange={(sidebar_sort) => void update({ sidebar_sort })}
                  />
                </Row>
              </>
            )}

            {section === "GitHub" && (
              <>
                <Row label="Host">
                  <Input
                    className="h-8 w-56"
                    placeholder="github.com"
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    onBlur={() => void api.githubSetHost(host || "github.com")}
                  />
                </Row>
                <Row label="OAuth Client ID">
                  <Input
                    className="h-8 w-56"
                    placeholder="(none set)"
                    value={clientId ?? ""}
                    onChange={(e) => void setClientId(e.target.value)}
                  />
                </Row>
                <p className="pt-2 text-xs text-muted-foreground">
                  For GitHub Enterprise Server, set Host to your GHES domain (e.g.
                  github.example.com) — API and web links adjust automatically.
                </p>
              </>
            )}

            {section === "Advanced" && (
              <>
                <Row label="Git binary path">
                  <Input
                    className="h-8 w-56"
                    placeholder="git"
                    value={settings.git_binary_path ?? ""}
                    onChange={(e) => void update({ git_binary_path: e.target.value || null })}
                  />
                </Row>
                <Row label="Filesystem watch">
                  <Checkbox
                    checked={settings.fs_watch_enabled}
                    onCheckedChange={(checked) => void update({ fs_watch_enabled: checked === true })}
                  />
                </Row>
                <Row label="Settings backup">
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => void exportSettings()}>
                      <DownloadIcon className="size-3.5" />
                      Export…
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void importSettings()}>
                      <UploadIcon className="size-3.5" />
                      Import…
                    </Button>
                  </div>
                </Row>
                {importExportError && (
                  <p className="text-xs text-destructive">{importExportError}</p>
                )}
                <Row label="Updates">
                  <UpdateChecker />
                </Row>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
