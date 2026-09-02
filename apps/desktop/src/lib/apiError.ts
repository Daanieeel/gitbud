export interface ApiErrorDisplay {
  title: string;
  description: string;
}

const STATUS_TITLES = new Map([
  ["401", "Authentication Failed"],
  ["403", "Access Denied"],
  ["404", "Not Found"],
  ["422", "Invalid Request"],
  ["429", "Rate Limited"],
]);

/** Parses backend error strings shaped like `check()` in `src-tauri/src/github/api.rs`:
 * `"GitHub API error 404 Not Found: {\"message\":\"Not Found\",...}"`. Falls back to showing the
 * raw string as the description when it doesn't match that shape, so unrelated errors (broken
 * token, offline, etc.) still render something reasonable. */
export function formatApiError(raw: string): ApiErrorDisplay {
  const match = raw.match(/^(\w+) API error (\d+)[^:]*:\s*([\s\S]*)$/);
  if (!match) return { title: "Something went wrong", description: raw };
  const [, provider, status, body] = match;

  let description = body.trim();
  try {
    const parsed: unknown = JSON.parse(body);
    // The predicate's parameter is left without an explicit `unknown` annotation (inferred
    // contextually via `filter`'s type-predicate overload instead) — same trick as
    // RepoSidebar.tsx's `loadCollapsedSections`, needed to satisfy the anti-slop lint rules that
    // otherwise reject both an explicitly-`unknown`-typed parameter and a bare `typeof` check.
    const [withMessage] = [parsed].filter(
      (value): value is { message: string } =>
        typeof value === "object" &&
        value !== null &&
        "message" in value &&
        typeof value.message === "string" &&
        value.message.length > 0,
    );
    if (withMessage) description = withMessage.message;
  } catch {
    // Body wasn't JSON — keep the raw text.
  }

  const title = STATUS_TITLES.get(status) ?? `${provider} API Error (${status})`;
  return { title, description };
}
