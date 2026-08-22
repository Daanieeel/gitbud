import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSettingsStore } from "@/store/useSettingsStore";
import { useGitHubStore } from "@/store/useGitHubStore";
import { useRepoStore } from "@/store/useRepoStore";
import { api } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import type { DiffViewMode, PullStrategy, SidebarSort, ThemeMode } from "@/lib/types";

const SECTIONS = ["General", "Git", "Diff", "Sidebar", "GitHub", "Advanced"] as const;
type Section = (typeof SECTIONS)[number];

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
  const { settings, update } = useSettingsStore();
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
                key={s}
                onClick={() => setSection(s)}
                className={cn(
                  "rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                  section === s && "bg-accent font-medium",
                )}
              >
                {s}
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
                    Save Identity
                  </Button>
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
                  <input
                    type="checkbox"
                    checked={settings.ignore_whitespace}
                    onChange={(e) => void update({ ignore_whitespace: e.target.checked })}
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
                  <input
                    type="checkbox"
                    checked={settings.show_ahead_behind}
                    onChange={(e) => void update({ show_ahead_behind: e.target.checked })}
                  />
                </Row>
                <Row label="Sort repos by">
                  <Select
                    value={settings.sidebar_sort}
                    options={["group", "name", "recent"] as SidebarSort[]}
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
                  <input
                    type="checkbox"
                    checked={settings.fs_watch_enabled}
                    onChange={(e) => void update({ fs_watch_enabled: e.target.checked })}
                  />
                </Row>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
