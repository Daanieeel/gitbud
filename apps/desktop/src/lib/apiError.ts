/** Parses backend error strings shaped like `check()` in `src-tauri/src/github/api.rs`:
 * `"GitHub API error 404 Not Found: {\"message\":\"Not Found\",...}"`. Falls back to showing the
 * raw string as the description when it doesn't match that shape, so unrelated errors (broken
 * token, offline, etc.) still render something reasonable. */
export function formatApiError(raw: string): { title: string; description: string } {
  const match = raw.match(/^(\w+) API error (\d+)[^:]*:\s*([\s\S]*)$/);
  if (!match) return { title: "Something went wrong", description: raw };
  const [, provider, status, body] = match;

  let description = body.trim();
  try {
    const parsed: unknown = JSON.parse(body);
    if (
      parsed &&
      typeof parsed === "object" &&
      "message" in parsed &&
      typeof parsed.message === "string" &&
      parsed.message
    ) {
      description = parsed.message;
    }
  } catch {
    // Body wasn't JSON — keep the raw text.
  }

  const titles: Record<string, string> = {
    "401": "Authentication Failed",
    "403": "Access Denied",
    "404": "Not Found",
    "422": "Invalid Request",
    "429": "Rate Limited",
  };
  const title = titles[status] ?? `${provider} API Error (${status})`;
  return { title, description };
}
