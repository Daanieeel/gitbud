export type RemoteProvider = "github" | "gitlab" | "bitbucket" | "unknown";

export function detectRemoteProvider(host: string): RemoteProvider {
  const h = host.toLowerCase();
  if (h.includes("github")) return "github";
  if (h.includes("gitlab")) return "gitlab";
  if (h.includes("bitbucket")) return "bitbucket";
  return "unknown";
}
