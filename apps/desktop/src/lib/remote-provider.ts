export type RemoteProvider = "github" | "gitlab" | "bitbucket" | "unknown";

export function detectRemoteProvider(host: string): RemoteProvider {
  const h = host.toLowerCase();
  if (h.includes("github")) return "github";
  if (h.includes("gitlab")) return "gitlab";
  if (h.includes("bitbucket")) return "bitbucket";
  return "unknown";
}

/** Where to add a signing key on `host`'s web UI, plus a short note on anything provider-
 * specific worth telling the user (e.g. GitHub requiring the key registered as a distinct
 * "Signing Key", not just any authentication key). `null` when the provider has no known
 * dedicated page — the wizard falls back to a generic "check your provider's docs" message. */
export function signingKeySettingsUrl(
  host: string,
  provider: RemoteProvider,
  format: "ssh" | "openpgp",
): { url: string; note: string } | null {
  switch (provider) {
    case "github":
      return format === "ssh"
        ? {
            url: `https://${host}/settings/ssh/new`,
            note: 'Set "Key type" to Signing Key. An Authentication key alone won\'t mark your commits Verified.',
          }
        : { url: `https://${host}/settings/gpg/new`, note: "" };
    case "gitlab":
      return format === "ssh"
        ? { url: `https://${host}/-/user_settings/ssh_keys`, note: "" }
        : { url: `https://${host}/-/user_settings/gpg_keys`, note: "" };
    case "bitbucket":
      return format === "ssh"
        ? { url: "https://bitbucket.org/account/settings/ssh-keys/", note: "" }
        : null;
    default:
      return null;
  }
}

/** Builds a file-view URL for a repo's remote web UI, given its base repo URL (as returned
 * by `remoteWebInfo`) and provider. Falls back to GitHub's `/blob/` path shape for unknown
 * hosts, since most self-hosted forges (Gitea, Forgejo, etc.) mirror it. */
export function remoteFileUrl(
  baseRepoUrl: string,
  provider: RemoteProvider,
  ref: string,
  path: string,
  line?: number,
): string {
  const encPath = path.split("/").map(encodeURIComponent).join("/");
  const encRef = encodeURIComponent(ref);
  switch (provider) {
    case "gitlab":
      return `${baseRepoUrl}/-/blob/${encRef}/${encPath}${line != null ? `#L${line}` : ""}`;
    case "bitbucket":
      return `${baseRepoUrl}/src/${encRef}/${encPath}${line != null ? `#lines-${line}` : ""}`;
    default:
      return `${baseRepoUrl}/blob/${encRef}/${encPath}${line != null ? `#L${line}` : ""}`;
  }
}
