import { useEffect, useState } from "react";
import {
  ArrowDownAZIcon,
  ColumnsIcon,
  CodeIcon,
  DownloadIcon,
  FastForwardIcon,
  FolderIcon,
  FolderOpenIcon,
  FolderTreeIcon,
  GitBranchIcon,
  GitMergeIcon,
  GlobeIcon,
  GripVerticalIcon,
  HistoryIcon,
  HourglassIcon,
  Minimize2Icon,
  MonitorIcon,
  MoonIcon,
  PanelLeftIcon,
  RowsIcon,
  SaveIcon,
  SettingsIcon,
  ShieldCheckIcon,
  ShieldOffIcon,
  SlidersHorizontalIcon,
  SunIcon,
  Trash2Icon,
  UploadIcon,
  ZapIcon,
} from "lucide-react";
import { save, open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { Button } from "@gitbud/ui/button";
import { Input } from "@gitbud/ui/input";
import { NumberInput } from "@gitbud/ui/number-input";
import { Checkbox } from "@gitbud/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@gitbud/ui/popover";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@gitbud/ui/dialog";
import { relaunch } from "@tauri-apps/plugin-process";
import { GitHubMark } from "@gitbud/ui/brand-logo";
import { UpdateChecker } from "./UpdateChecker";
import { SigningSetupDialog } from "./SigningSetupDialog";
import { EditorPicker } from "./EditorPicker";
import { CUSTOM_EDITOR_ID, customEditorName, findEditor } from "@/lib/editors";
import { useCustomEditorIcon } from "@/hooks/queries/useCustomEditorIcon";
import Flag from "react-flagpack";
import "react-flagpack/dist/style.css";
import { useSettingsStore } from "@/store/useSettingsStore";
import { listTimezones, systemTimezone } from "@/lib/timezone";
import { countryForTimezone, countryNameForTimezone, flagAssetCode } from "@/lib/timezoneCountries";
import { SingleSelectField, type SingleSelectOption } from "@/components/pr/SingleSelectField";
import { useGitHubStore } from "@/store/useGitHubStore";
import { useRepoStore } from "@/store/useRepoStore";
import { api } from "@/lib/tauri";
import { cn } from "@gitbud/ui/utils";
import { Slider } from "@gitbud/ui/slider";
import { isSinglePath } from "@/lib/dialogPaths";
import type {
  CacheLevel,
  DateFormatMode,
  DiffAlgorithm,
  DiffViewMode,
  OpenPrAfterCreation,
  PullStrategy,
  SidebarSort,
  SigningStatus,
  ThemeMode,
  TimeFormatMode,
} from "@/lib/types";

const SECTIONS = [
  { key: "General", icon: SettingsIcon },
  { key: "Git", icon: GitBranchIcon },
  { key: "Diff", icon: ColumnsIcon },
  { key: "Sidebar", icon: PanelLeftIcon },
  { key: "GitHub", icon: GitHubMark },
  { key: "Advanced", icon: SlidersHorizontalIcon },
] as const;
type Section = (typeof SECTIONS)[number]["key"];

const CACHE_LEVELS: { key: CacheLevel; label: string; tooltip: string }[] = [
  { key: "none", label: "None", tooltip: "Freed instantly. Lowest memory, most refetching." },
  { key: "minimal", label: "Minimal", tooltip: "Freed after 5 seconds." },
  { key: "balanced", label: "Balanced", tooltip: "Freed after 30 seconds. Default." },
  { key: "relaxed", label: "Relaxed", tooltip: "Freed after 2 minutes. Snappiest, most memory." },
];

const OPEN_PR_OPTIONS: { key: OpenPrAfterCreation; label: string; description: string }[] = [
  { key: "in-app", label: "In-App", description: "Open the pull request in the Pull Requests tab" },
  { key: "provider", label: "Provider", description: "Open the pull request in your browser" },
];

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

// Computed once at module load, not per render — neither the runtime's full zone list nor the
// machine's own resolved zone changes while the app is running.
const TIMEZONES = listTimezones();
const SYSTEM_TIMEZONE = systemTimezone();

function timezoneFlag(tz: string) {
  const code = countryForTimezone(tz);
  // Falls back to a generic globe rather than leaving `slotLeft` empty — a zone missing from
  // `TIMEZONE_COUNTRY` (a newer IANA addition, most likely) would otherwise be the only option
  // in the list with nothing in that slot, reading as broken rather than "no flag for this one".
  return code ? (
    <Flag code={flagAssetCode(code)} size="s" hasBorder={false} />
  ) : (
    <GlobeIcon className="size-3.5 text-muted-foreground" />
  );
}

function timezoneOption(tz: string): SingleSelectOption {
  // The IANA name itself (`_` standing in for a space, e.g. "New_York") is what's stored and
  // looked up everywhere else — only the display label/search text render it human-readable.
  const displayName = tz.replace(/_/g, " ");
  return {
    key: tz,
    label: displayName,
    // Includes the country's display name (not just the zone's own city name) so typing e.g.
    // "Germany" finds "Europe/Berlin" too, not only "berlin" itself.
    searchText: `${displayName} ${countryNameForTimezone(tz) ?? ""}`,
    slotLeft: timezoneFlag(tz),
  };
}

// The handful of zones shown above the divider, ahead of the full A-Z list — major business/
// population hubs across time zones, not derived from anything about the current user. Each
// entry lists every alternate spelling `Intl.supportedValuesOf` might return for it (engines
// disagree, e.g. "Asia/Kolkata" vs the older "Asia/Calcutta") so this still resolves correctly
// regardless of which one this runtime actually reports.
const COMMON_TIMEZONE_CANDIDATES: string[][] = [
  ["America/New_York"],
  ["America/Chicago"],
  ["America/Denver"],
  ["America/Los_Angeles"],
  ["Europe/London"],
  ["Europe/Paris"],
  ["Asia/Kolkata", "Asia/Calcutta"],
  ["Asia/Shanghai"],
  ["Asia/Tokyo"],
  ["Australia/Sydney"],
];
const TIMEZONE_SET = new Set(TIMEZONES);
const COMMON_TIMEZONES = COMMON_TIMEZONE_CANDIDATES.map((candidates) =>
  candidates.find((tz) => TIMEZONE_SET.has(tz)),
).filter((tz) => tz !== undefined);
const COMMON_TIMEZONE_SET = new Set(COMMON_TIMEZONES);
const REST_TIMEZONES = TIMEZONES.filter((tz) => !COMMON_TIMEZONE_SET.has(tz));

const TIMEZONE_OPTIONS: SingleSelectOption[] = [
  {
    key: "system",
    label: `System (${SYSTEM_TIMEZONE.replace(/_/g, " ")})`,
    searchText: `system ${SYSTEM_TIMEZONE.replace(/_/g, " ")} ${countryNameForTimezone(SYSTEM_TIMEZONE) ?? ""}`,
    slotLeft: timezoneFlag(SYSTEM_TIMEZONE),
  },
  ...COMMON_TIMEZONES.map(timezoneOption),
  ...REST_TIMEZONES.map((tz, i) => ({ ...timezoneOption(tz), separatorBefore: i === 0 })),
];

// "European"/"American" are representative, not literal — the flag names the numeric convention
// (24-hour, dd.MM.yyyy) each stands for, not a claim that only that one country uses it.
const TIMEZONE_FORMAT_ICON = <GlobeIcon className="size-3.5 text-muted-foreground" />;

const DATE_FORMAT_OPTIONS: SingleSelectOption[] = [
  {
    key: "american",
    label: "American (MM/dd/yyyy)",
    slotLeft: <Flag code={flagAssetCode("US")} size="s" hasBorder={false} />,
  },
  {
    key: "european",
    label: "European (dd.MM.yyyy)",
    slotLeft: <Flag code="EU" size="s" hasBorder={false} />,
  },
  {
    key: "timezone",
    label: "According to time zone",
    slotLeft: TIMEZONE_FORMAT_ICON,
  },
];

const TIME_FORMAT_OPTIONS: SingleSelectOption[] = [
  {
    key: "american",
    label: "American (12-hour)",
    slotLeft: <Flag code={flagAssetCode("US")} size="s" hasBorder={false} />,
  },
  {
    key: "european",
    label: "European (24-hour)",
    slotLeft: <Flag code="EU" size="s" hasBorder={false} />,
  },
  {
    key: "timezone",
    label: "According to time zone",
    slotLeft: TIMEZONE_FORMAT_ICON,
  },
];

const THEME_OPTIONS: SingleSelectOption[] = [
  {
    key: "light",
    label: "Light",
    slotLeft: <SunIcon className="size-3.5 text-muted-foreground" />,
  },
  {
    key: "dark",
    label: "Dark",
    slotLeft: <MoonIcon className="size-3.5 text-muted-foreground" />,
  },
  {
    key: "system",
    label: "System",
    slotLeft: <MonitorIcon className="size-3.5 text-muted-foreground" />,
  },
];

const GIT_SCOPE_OPTIONS: SingleSelectOption[] = [
  {
    key: "global",
    label: "Global (all repos)",
    slotLeft: <GlobeIcon className="size-3.5 text-muted-foreground" />,
  },
  {
    key: "repo",
    label: "This repo only",
    slotLeft: <FolderIcon className="size-3.5 text-muted-foreground" />,
  },
];

const PULL_STRATEGY_OPTIONS: SingleSelectOption[] = [
  {
    key: "merge",
    label: "Merge",
    slotLeft: <GitMergeIcon className="size-3.5 text-muted-foreground" />,
  },
  {
    key: "rebase",
    label: "Rebase",
    slotLeft: <GitBranchIcon className="size-3.5 text-muted-foreground" />,
  },
  {
    key: "ff-only",
    label: "Fast-forward only",
    slotLeft: <FastForwardIcon className="size-3.5 text-muted-foreground" />,
  },
];

const DIFF_VIEW_OPTIONS: SingleSelectOption[] = [
  {
    key: "unified",
    label: "Unified",
    slotLeft: <RowsIcon className="size-3.5 text-muted-foreground" />,
  },
  {
    key: "split",
    label: "Split",
    slotLeft: <ColumnsIcon className="size-3.5 text-muted-foreground" />,
  },
];

const DIFF_ALGORITHM_OPTIONS: SingleSelectOption[] = [
  {
    key: "myers",
    label: "Myers",
    slotLeft: <ZapIcon className="size-3.5 text-muted-foreground" />,
  },
  {
    key: "minimal",
    label: "Minimal",
    slotLeft: <Minimize2Icon className="size-3.5 text-muted-foreground" />,
  },
  {
    key: "patience",
    label: "Patience",
    slotLeft: <HourglassIcon className="size-3.5 text-muted-foreground" />,
  },
];

const SIDEBAR_SORT_OPTIONS: SingleSelectOption[] = [
  {
    key: "group",
    label: "Grouped by owner",
    slotLeft: <FolderTreeIcon className="size-3.5 text-muted-foreground" />,
  },
  {
    key: "name",
    label: "Name",
    slotLeft: <ArrowDownAZIcon className="size-3.5 text-muted-foreground" />,
  },
  {
    key: "recent",
    label: "Recently used",
    slotLeft: <HistoryIcon className="size-3.5 text-muted-foreground" />,
  },
  {
    key: "manual",
    label: "Manual order",
    slotLeft: <GripVerticalIcon className="size-3.5 text-muted-foreground" />,
  },
];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/** Clear button + confirm popover shared by the "Cached repo data" and "Cached user avatars"
 * rows below — same interaction, different scope/copy. */
function ClearCacheButton({
  clearing,
  disabled,
  confirmOpen,
  onConfirmOpenChange,
  confirmText,
  onClear,
}: {
  clearing: boolean;
  disabled: boolean;
  confirmOpen: boolean;
  onConfirmOpenChange: (open: boolean) => void;
  confirmText: string;
  onClear: () => void;
}) {
  return (
    <Popover open={confirmOpen} onOpenChange={onConfirmOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm" className="h-8 gap-1.5" disabled={disabled}>
          <Trash2Icon className="size-3.5" />
          {clearing ? "Clearing…" : "Clear"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-2 p-3">
        <p className="text-sm">{confirmText}</p>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => onConfirmOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" variant="destructive" onClick={onClear}>
            Clear
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { settings, update, exportTo, importFrom } = useSettingsStore();
  const favoriteEditor = findEditor(settings.favorite_editor);
  const customEditorIcon = useCustomEditorIcon(
    settings.favorite_editor === CUSTOM_EDITOR_ID ? settings.custom_editor_command : null,
  );
  const [importExportError, setImportExportError] = useState<string | null>(null);
  const [pendingCacheLevel, setPendingCacheLevel] = useState<CacheLevel | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [repoCacheBytes, setRepoCacheBytes] = useState<number | null>(null);
  const [avatarCacheBytes, setAvatarCacheBytes] = useState<number | null>(null);
  const [clearingRepoCache, setClearingRepoCache] = useState(false);
  const [clearingAvatarCache, setClearingAvatarCache] = useState(false);
  const [confirmClearRepoCache, setConfirmClearRepoCache] = useState(false);
  const [confirmClearAvatarCache, setConfirmClearAvatarCache] = useState(false);
  const clientId = useGitHubStore((s) => s.clientId);
  const setClientId = useGitHubStore((s) => s.setClientId);
  const repoPath = useRepoStore((s) => s.selectedRepo);

  const [section, setSection] = useState<Section>("General");
  const [host, setHost] = useState("github.com");
  const [gitName, setGitName] = useState("");
  const [gitEmail, setGitEmail] = useState("");
  const [gitScope, setGitScope] = useState<"global" | "repo">("global");
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [signingStatus, setSigningStatus] = useState<SigningStatus | null>(null);
  const [signingDialogOpen, setSigningDialogOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    void api.githubGetHost().then(setHost);
    if (repoPath) {
      void api.getGitIdentity(repoPath).then(([name, email]) => {
        setGitName(name ?? "");
        setGitEmail(email ?? "");
      });
      void api.getSigningStatus(repoPath).then(setSigningStatus);
    }
    void api.getCacheSizes().then(({ repoBytes, avatarBytes }) => {
      setRepoCacheBytes(repoBytes);
      setAvatarCacheBytes(avatarBytes);
    });
  }, [open, repoPath]);

  const clearRepoCache = async () => {
    setConfirmClearRepoCache(false);
    setClearingRepoCache(true);
    try {
      await api.clearRepoCache();
      setRepoCacheBytes((await api.getCacheSizes()).repoBytes);
    } finally {
      setClearingRepoCache(false);
    }
  };

  const clearAvatarCache = async () => {
    setConfirmClearAvatarCache(false);
    setClearingAvatarCache(true);
    try {
      await api.clearAvatarCache();
      setAvatarCacheBytes((await api.getCacheSizes()).avatarBytes);
    } finally {
      setClearingAvatarCache(false);
    }
  };

  const saveGitIdentity = async () => {
    if (!repoPath) return;
    const startedAt = Date.now();
    setSavingIdentity(true);
    try {
      await api.setGitIdentity(repoPath, gitName, gitEmail, gitScope === "global");
    } finally {
      const elapsed = Date.now() - startedAt;
      if (elapsed < 400) await new Promise((resolve) => setTimeout(resolve, 400 - elapsed));
      setSavingIdentity(false);
    }
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
      if (isSinglePath(src)) await importFrom(src);
    } catch (e) {
      setImportExportError(String(e));
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex h-[75vh] w-[75vw] max-w-none flex-col">
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 gap-4">
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
            <div className="min-w-0 flex-1 divide-y divide-border overflow-auto">
              {section === "General" && (
                <>
                  <Row label="Theme">
                    <SingleSelectField
                      options={THEME_OPTIONS}
                      selected={settings.theme}
                      onChange={(value) =>
                        // SAFETY: `value` is always one of `THEME_OPTIONS`'s own literal keys
                        // ("light"/"dark"/"system") — this field has no clear option, so
                        // `onChange` can't be called with anything else.
                        void update({ theme: value as ThemeMode })
                      }
                      triggerClassName="h-8 w-32"
                      searchable={false}
                    />
                  </Row>
                  <Row label="Time zone">
                    <SingleSelectField
                      options={TIMEZONE_OPTIONS}
                      selected={settings.timezone}
                      onChange={(timezone) => void update({ timezone })}
                      triggerClassName="h-8 w-56"
                    />
                  </Row>
                  <Row label="Date format">
                    <SingleSelectField
                      options={DATE_FORMAT_OPTIONS}
                      selected={settings.date_format}
                      onChange={(value) =>
                        // SAFETY: `value` is always one of `DATE_FORMAT_OPTIONS`'s own literal
                        // keys ("american"/"european"/"timezone") — this field has no clear
                        // option, so `onChange` can't be called with anything else.
                        void update({ date_format: value as DateFormatMode })
                      }
                      triggerClassName="h-8 w-64"
                      searchable={false}
                    />
                  </Row>
                  <Row label="Time format">
                    <SingleSelectField
                      options={TIME_FORMAT_OPTIONS}
                      selected={settings.time_format}
                      onChange={(value) =>
                        // SAFETY: `value` is always one of `TIME_FORMAT_OPTIONS`'s own literal
                        // keys ("american"/"european"/"timezone") — this field has no clear
                        // option, so `onChange` can't be called with anything else.
                        void update({ time_format: value as TimeFormatMode })
                      }
                      triggerClassName="h-8 w-64"
                      searchable={false}
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
                      onCheckedChange={(checked) =>
                        void update({ desktop_notifications: checked === true })
                      }
                    />
                  </Row>
                  <Row label="Auto-stage new changes">
                    <Checkbox
                      checked={settings.auto_stage_new_changes}
                      onCheckedChange={(checked) =>
                        void update({ auto_stage_new_changes: checked === true })
                      }
                    />
                  </Row>
                  <div className="flex items-center justify-between gap-6 py-1.5">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm text-muted-foreground">Memory usage</span>
                      <span className="max-w-[40ch] text-xs text-muted-foreground/70">
                        Lower uses less memory but refetches more often; higher keeps more in memory
                        for snappier repo switching.
                      </span>
                    </div>
                    <Slider
                      className="flex-1"
                      min={0}
                      max={CACHE_LEVELS.length - 1}
                      step={1}
                      value={[CACHE_LEVELS.findIndex((l) => l.key === settings.cache_level)]}
                      onValueChange={([index]) => setPendingCacheLevel(CACHE_LEVELS[index].key)}
                      marks={CACHE_LEVELS.map((l, i) => ({
                        value: i,
                        label: l.label,
                        tooltip: l.tooltip,
                      }))}
                    />
                  </div>
                  <Row label="Favorite editor">
                    <EditorPicker
                      onSelect={(favorite_editor, customAppPath) =>
                        void update({
                          favorite_editor,
                          custom_editor_command:
                            favorite_editor === CUSTOM_EDITOR_ID ? (customAppPath ?? null) : null,
                        })
                      }
                    >
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-8 w-56 justify-start gap-2"
                      >
                        {favoriteEditor ? (
                          <>
                            <img src={favoriteEditor.icon} alt="" className="size-4 shrink-0" />
                            <span className="truncate">{favoriteEditor.name}</span>
                          </>
                        ) : settings.favorite_editor === CUSTOM_EDITOR_ID &&
                          settings.custom_editor_command ? (
                          <>
                            {customEditorIcon ? (
                              <img src={customEditorIcon} alt="" className="size-4 shrink-0" />
                            ) : (
                              <CodeIcon className="size-4 shrink-0" />
                            )}
                            <span className="truncate" title={settings.custom_editor_command}>
                              {customEditorName(settings.custom_editor_command)}
                            </span>
                          </>
                        ) : (
                          <span className="text-muted-foreground">Choose an editor…</span>
                        )}
                      </Button>
                    </EditorPicker>
                  </Row>
                  <div className="flex flex-col gap-1.5 py-1.5">
                    <span className="text-sm text-muted-foreground">Open PR after creation</span>
                    <div className="flex gap-2">
                      {OPEN_PR_OPTIONS.map((o) => (
                        <button
                          key={o.key}
                          type="button"
                          onClick={() => void update({ open_pr_after_creation: o.key })}
                          className={cn(
                            "flex-1 rounded-md border border-border p-2 text-left",
                            settings.open_pr_after_creation === o.key &&
                              "border-2 border-primary bg-primary/10 p-[7px]",
                          )}
                        >
                          <div className="flex flex-col gap-1">
                            <div className="text-sm font-medium">{o.label}</div>
                            <div className="text-xs text-muted-foreground">{o.description}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 py-1.5">
                    <div className="flex items-center justify-between gap-6">
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-sm text-muted-foreground">Local data</span>
                        <span className="text-xs text-muted-foreground/70">
                          Local mirror of pull requests, files, comments, checks, and avatars — kept
                          on disk regardless of the memory setting above, for instant paint and
                          offline viewing.
                        </span>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="h-8 shrink-0 gap-1.5"
                        onClick={() =>
                          void api.getCacheDirPath().then((dir) => revealItemInDir(dir))
                        }
                      >
                        <FolderOpenIcon className="size-3.5" />
                        Open
                      </Button>
                    </div>
                    <div className="flex items-center justify-between gap-6 pl-3">
                      <span className="text-sm text-muted-foreground">Cached repo data</span>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          {repoCacheBytes === null ? "…" : formatBytes(repoCacheBytes)}
                        </span>
                        <ClearCacheButton
                          clearing={clearingRepoCache}
                          disabled={clearingRepoCache || repoCacheBytes === 0}
                          confirmOpen={confirmClearRepoCache}
                          onConfirmOpenChange={setConfirmClearRepoCache}
                          confirmText="Delete all cached PR data? It'll be re-fetched from GitHub as needed."
                          onClear={() => void clearRepoCache()}
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-6 pl-3">
                      <span className="text-sm text-muted-foreground">Cached user avatars</span>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-sm text-muted-foreground">
                          {avatarCacheBytes === null ? "…" : formatBytes(avatarCacheBytes)}
                        </span>
                        <ClearCacheButton
                          clearing={clearingAvatarCache}
                          disabled={clearingAvatarCache || avatarCacheBytes === 0}
                          confirmOpen={confirmClearAvatarCache}
                          onConfirmOpenChange={setConfirmClearAvatarCache}
                          confirmText="Delete all cached avatars? They'll be re-fetched as PRs load."
                          onClear={() => void clearAvatarCache()}
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {section === "Git" && (
                <>
                  <Row label="Name">
                    <Input
                      className="h-8 w-56"
                      value={gitName}
                      onChange={(e) => setGitName(e.target.value)}
                    />
                  </Row>
                  <Row label="Email">
                    <Input
                      className="h-8 w-56"
                      value={gitEmail}
                      onChange={(e) => setGitEmail(e.target.value)}
                    />
                  </Row>
                  <Row label="Apply to">
                    <SingleSelectField
                      options={GIT_SCOPE_OPTIONS}
                      selected={gitScope}
                      onChange={(value) =>
                        // SAFETY: `value` is always one of `GIT_SCOPE_OPTIONS`'s own literal
                        // keys ("global"/"repo") — this field has no clear option, so `onChange`
                        // can't be called with anything else.
                        setGitScope(value as "global" | "repo")
                      }
                      triggerClassName="h-8 w-40"
                      searchable={false}
                    />
                  </Row>
                  <div className="flex justify-end py-2">
                    <Button
                      size="sm"
                      disabled={savingIdentity}
                      onClick={() => void saveGitIdentity()}
                    >
                      <SaveIcon className={cn("size-3.5", savingIdentity && "animate-spin")} />
                      {savingIdentity ? "Saving…" : "Save Identity"}
                    </Button>
                  </div>
                  <Row label="Commit signing">
                    <div className="flex items-center gap-2">
                      {signingStatus?.enabled ? (
                        <ShieldCheckIcon className="size-4 text-accent-green" />
                      ) : (
                        <ShieldOffIcon className="size-4 text-muted-foreground" />
                      )}
                      <span className="text-xs text-muted-foreground">
                        {signingStatus?.enabled ? `On (${signingStatus.format})` : "Off"}
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setSigningDialogOpen(true)}
                      >
                        {signingStatus?.enabled ? "Manage" : "Set Up"}
                      </Button>
                    </div>
                  </Row>
                  <SigningSetupDialog
                    open={signingDialogOpen}
                    onOpenChange={(next) => {
                      setSigningDialogOpen(next);
                      if (!next && repoPath)
                        void api.getSigningStatus(repoPath).then(setSigningStatus);
                    }}
                    repoPath={repoPath}
                    name={gitName}
                    email={gitEmail}
                  />
                  <Row label="Default branch name">
                    <Input
                      className="h-8 w-32"
                      value={settings.default_branch_name}
                      onChange={(e) => void update({ default_branch_name: e.target.value })}
                    />
                  </Row>
                  <Row label="Pull strategy">
                    <SingleSelectField
                      options={PULL_STRATEGY_OPTIONS}
                      selected={settings.pull_strategy}
                      onChange={(value) =>
                        // SAFETY: `value` is always one of `PULL_STRATEGY_OPTIONS`'s own literal
                        // keys ("merge"/"rebase"/"ff-only") — this field has no clear option, so
                        // `onChange` can't be called with anything else.
                        void update({ pull_strategy: value as PullStrategy })
                      }
                      triggerClassName="h-8 w-40"
                      searchable={false}
                    />
                  </Row>
                </>
              )}

              {section === "Diff" && (
                <>
                  <Row label="View">
                    <SingleSelectField
                      options={DIFF_VIEW_OPTIONS}
                      selected={settings.diff_view}
                      onChange={(value) =>
                        // SAFETY: `value` is always one of `DIFF_VIEW_OPTIONS`'s own literal
                        // keys ("unified"/"split") — this field has no clear option, so
                        // `onChange` can't be called with anything else.
                        void update({ diff_view: value as DiffViewMode })
                      }
                      triggerClassName="h-8 w-32"
                      searchable={false}
                    />
                  </Row>
                  <Row label="Ignore whitespace">
                    <Checkbox
                      checked={settings.ignore_whitespace}
                      onCheckedChange={(checked) =>
                        void update({ ignore_whitespace: checked === true })
                      }
                    />
                  </Row>
                  <Row label="Diff algorithm">
                    <SingleSelectField
                      options={DIFF_ALGORITHM_OPTIONS}
                      selected={settings.diff_algorithm}
                      onChange={(value) =>
                        // SAFETY: `value` is always one of `DIFF_ALGORITHM_OPTIONS`'s own literal
                        // keys ("myers"/"minimal"/"patience") — this field has no clear option,
                        // so `onChange` can't be called with anything else.
                        void update({ diff_algorithm: value as DiffAlgorithm })
                      }
                      triggerClassName="h-8 w-32"
                      searchable={false}
                    />
                  </Row>
                  <Row label="Font size">
                    <NumberInput
                      value={settings.diff_font_size}
                      onChange={(diff_font_size) => void update({ diff_font_size })}
                      min={8}
                      max={24}
                      className="w-28"
                    />
                  </Row>
                </>
              )}

              {section === "Sidebar" && (
                <>
                  <Row label="Show ahead/behind badges">
                    <Checkbox
                      checked={settings.show_ahead_behind}
                      onCheckedChange={(checked) =>
                        void update({ show_ahead_behind: checked === true })
                      }
                    />
                  </Row>
                  <Row label="Sort repos by">
                    <SingleSelectField
                      options={SIDEBAR_SORT_OPTIONS}
                      selected={settings.sidebar_sort}
                      onChange={(value) =>
                        // SAFETY: `value` is always one of `SIDEBAR_SORT_OPTIONS`'s own literal
                        // keys ("group"/"name"/"recent"/"manual") — this field has no clear
                        // option, so `onChange` can't be called with anything else.
                        void update({ sidebar_sort: value as SidebarSort })
                      }
                      triggerClassName="h-8 w-44"
                      searchable={false}
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
                    github.example.com). API and web links adjust automatically.
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
                      onCheckedChange={(checked) =>
                        void update({ fs_watch_enabled: checked === true })
                      }
                    />
                  </Row>
                  <Row label="Settings backup">
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => void exportSettings()}>
                        <DownloadIcon className="size-3.5" />
                        Export…
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => void importSettings()}>
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
      <Dialog
        open={pendingCacheLevel !== null}
        onOpenChange={(o) => !o && setPendingCacheLevel(null)}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Restart required</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Changing memory usage takes effect on the next launch. Restart now to apply it, or
            cancel to keep the current setting.
          </p>
          <DialogFooter>
            <Button
              variant="ghost"
              disabled={restarting}
              onClick={() => setPendingCacheLevel(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={restarting}
              onClick={() => {
                if (!pendingCacheLevel) return;
                setRestarting(true);
                void update({ cache_level: pendingCacheLevel }).then(() => relaunch());
              }}
            >
              {restarting ? "Restarting…" : "Restart Now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
