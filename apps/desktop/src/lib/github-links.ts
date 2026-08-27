import { api } from "./tauri";

async function webBase(): Promise<string> {
  const host = await api.githubGetHost().catch(() => "github.com");
  return `https://${host}`;
}

export async function githubRepoUrl(repoPath: string): Promise<string | null> {
  const remote = await api.githubRemoteOwnerRepo(repoPath).catch(() => null);
  if (!remote) return null;
  const [owner, repo] = remote;
  return `${await webBase()}/${owner}/${repo}`;
}

export async function githubCommitUrl(repoPath: string, oid: string): Promise<string | null> {
  const base = await githubRepoUrl(repoPath);
  return base ? `${base}/commit/${oid}` : null;
}

export async function githubFileUrl(
  repoPath: string,
  ref: string,
  path: string,
  line?: number,
): Promise<string | null> {
  const base = await githubRepoUrl(repoPath);
  if (!base) return null;
  const suffix = line != null ? `#L${line}` : "";
  return `${base}/blob/${ref}/${path}${suffix}`;
}
