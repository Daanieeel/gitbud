import { CodeIcon, CopyIcon, ExternalLinkIcon, FolderOpenIcon, TerminalIcon } from "lucide-react";
import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { ContextMenuItem, ContextMenuSeparator } from "@gitbud/ui/context-menu";
import { GitHubMark, GitLabMark, BitbucketMark } from "@gitbud/ui/brand-logo";
import { copyToClipboard } from "@/lib/clipboard";
import { remoteFileUrl, type RemoteProvider } from "@/lib/remote-provider";
import { api } from "@/lib/tauri";
import { useSettingsStore } from "@/store/useSettingsStore";
import { CUSTOM_EDITOR_ID, customEditorName, findEditor } from "@/lib/editors";
import { useCustomEditorIcon } from "@/hooks/queries/useCustomEditorIcon";

const REMOTE_PROVIDER_NAME = {
  github: "GitHub",
  gitlab: "GitLab",
  bitbucket: "Bitbucket",
  unknown: "Remote",
} satisfies Record<RemoteProvider, string>;

interface GenericFileMenuItemsProps {
  repoPath: string;
  path: string;
  /** Ref this file's content should be viewed at on the remote — a commit oid/sha appropriate to
   * whatever list this menu is on, not necessarily the current branch. Omit to hide "View File on
   * <Provider>" entirely, e.g. for a stash: its contents were never pushed anywhere, so there's
   * no remote URL that could possibly resolve. */
  providerRef?: string;
  remoteInfo: { url: string; provider: RemoteProvider } | null;
}

/** The subset of FileList.tsx's (Changes tab) per-file context menu that still makes sense
 * outside a live working tree — Reveal in Finder, Open in Terminal/Editor, View File on
 * <Provider>, Copy Path. Everything else there (stage/unstage, discard, gitignore) is specific
 * to actual uncommitted changes and has no equivalent on a read-only file list (commit history,
 * a PR's changed files, a stash). Meant to be spread inside another list's own
 * `<ContextMenuContent>`, alongside whatever items are specific to that list. */
export function GenericFileMenuItems({
  repoPath,
  path,
  providerRef,
  remoteInfo,
}: GenericFileMenuItemsProps) {
  const favoriteEditorId = useSettingsStore((s) => s.settings.favorite_editor);
  const customEditorCommand = useSettingsStore((s) => s.settings.custom_editor_command);
  const favoriteEditorOption = findEditor(favoriteEditorId);
  const isCustomEditor = favoriteEditorId === CUSTOM_EDITOR_ID && !!customEditorCommand;
  const customIcon = useCustomEditorIcon(isCustomEditor ? customEditorCommand : null);
  const editorName =
    favoriteEditorOption?.name ??
    (isCustomEditor && customEditorCommand ? customEditorName(customEditorCommand) : "Editor");

  return (
    <>
      <ContextMenuItem
        onSelect={() => {
          void revealItemInDir(`${repoPath}/${path}`).catch(() =>
            toast.error("Couldn't find that file — it may not exist at this path anymore"),
          );
        }}
      >
        <FolderOpenIcon className="size-3.5" />
        Reveal in Finder
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => void api.openInTerminal(repoPath)}>
        <TerminalIcon className="size-3.5" />
        Open in Terminal
      </ContextMenuItem>
      {(favoriteEditorOption || isCustomEditor) && (
        <ContextMenuItem
          onSelect={() => {
            if (!favoriteEditorId) return;
            void api
              .openInEditor(`${repoPath}/${path}`, favoriteEditorId, customEditorCommand)
              .catch((err) => toast.error(String(err)));
          }}
        >
          {favoriteEditorOption ? (
            <img
              src={favoriteEditorOption.icon}
              alt=""
              className={favoriteEditorOption.id === "zed" ? "size-4" : "size-3.5"}
            />
          ) : customIcon ? (
            <img src={customIcon} alt="" className="size-3.5" />
          ) : (
            <CodeIcon className="size-3.5" />
          )}
          Open in {editorName}
        </ContextMenuItem>
      )}
      {providerRef && remoteInfo && (
        <ContextMenuItem
          onSelect={() => {
            void openUrl(remoteFileUrl(remoteInfo.url, remoteInfo.provider, providerRef, path));
          }}
        >
          {remoteInfo.provider === "github" && <GitHubMark className="size-3.5" />}
          {remoteInfo.provider === "gitlab" && <GitLabMark className="size-3.5" />}
          {remoteInfo.provider === "bitbucket" && <BitbucketMark className="size-3.5" />}
          {remoteInfo.provider === "unknown" && <ExternalLinkIcon className="size-3.5" />}
          View File on {REMOTE_PROVIDER_NAME[remoteInfo.provider]}
        </ContextMenuItem>
      )}
      <ContextMenuSeparator />
      <ContextMenuItem onSelect={() => void copyToClipboard(path.split("/").pop() ?? path)}>
        <CopyIcon className="size-3.5" />
        Copy Name
      </ContextMenuItem>
      <ContextMenuItem onSelect={() => void copyToClipboard(path)}>
        <CopyIcon className="size-3.5" />
        Copy Path
      </ContextMenuItem>
    </>
  );
}
