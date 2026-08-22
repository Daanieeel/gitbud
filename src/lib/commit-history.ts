const STORAGE_KEY = "gitbud:recent-commit-messages";
const MAX_ENTRIES = 20;

export function getRecentCommitMessages(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

export function pushRecentCommitMessage(summary: string): void {
  if (!summary.trim()) return;
  try {
    const existing = getRecentCommitMessages().filter((s) => s !== summary);
    const next = [summary, ...existing].slice(0, MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable (private browsing, etc.) — recall is a convenience, not critical.
  }
}
