import { useEffect, useState } from "react";
import { api } from "@/lib/tauri";

// Keyed by email alone (not repo/login) since the GitHub identity behind an email doesn't
// depend on which repo we're looking at — shared across every CommitList row in the session so
// scrolling past the same author again never re-triggers a lookup.
const avatarCache = new Map<string, string | null>();
const inFlight = new Map<string, Promise<string | null>>();

/** Resolves a plain git commit author's GitHub avatar by email, if one exists — "if available",
 * not guaranteed (only matches accounts with that email public/verified). Returns null while
 * unresolved or unavailable; `repoPath`/`login` null skips the lookup entirely (e.g. no GitHub
 * account signed in, or the repo has no GitHub remote). */
export function useAuthorAvatar(
  repoPath: string | null,
  login: string | null,
  email: string,
): string | null {
  const key = email.trim().toLowerCase();
  const [avatar, setAvatar] = useState<string | null>(() => avatarCache.get(key) ?? null);

  useEffect(() => {
    if (!repoPath || !login || !key) return;
    if (avatarCache.has(key)) {
      setAvatar(avatarCache.get(key) ?? null);
      return;
    }
    let cancelled = false;
    const promise =
      inFlight.get(key) ?? api.githubFindUserAvatarByEmail(repoPath, login, key).catch(() => null);
    inFlight.set(key, promise);
    void promise.then((url) => {
      avatarCache.set(key, url);
      inFlight.delete(key);
      if (!cancelled) setAvatar(url);
    });
    return () => {
      cancelled = true;
    };
  }, [repoPath, login, key]);

  return avatar;
}
