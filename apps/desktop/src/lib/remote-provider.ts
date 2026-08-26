export type RemoteProvider = "github" | "gitlab" | "bitbucket" | "unknown";

export function detectRemoteProvider(host: string): RemoteProvider {
  const h = host.toLowerCase();
  if (h.includes("github")) return "github";
  if (h.includes("gitlab")) return "gitlab";
  if (h.includes("bitbucket")) return "bitbucket";
  return "unknown";
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
