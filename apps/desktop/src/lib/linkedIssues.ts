export interface LinkedIssueRef {
  owner: string | null;
  repo: string | null;
  number: number;
}

// GitHub's closing-keyword grammar: any of these words (case-insensitive), immediately followed
// by one or more "#123" / "owner/repo#123" references, comma- or "and"-separated. The keyword
// doesn't have to start the line — "This PR fixes #123" counts just as much as "Fixes #123".
const KEYWORD_GROUP = "close[sd]?|fix(?:e[sd])?|resolve[sd]?";
const REF = "(?:([\\w.-]+)/([\\w.-]+))?#(\\d+)";
const CLOSING_RE = new RegExp(
  `\\b(?:${KEYWORD_GROUP})\\b\\s*:?\\s*((?:${REF}(?:\\s*(?:,|and)\\s*)?)+)`,
  "gi",
);
const REF_RE = new RegExp(REF, "gi");

/** Parses `Closes #123` / `Fixes org/repo#45` / `Resolves #1, #2 and #3` style references out of
 * a PR body, for the sidebar's linked-issues chips. Deliberately keyword-driven, not just any
 * `#123` in the text — a body that merely *mentions* an issue isn't the same as one that closes
 * it. */
export function parseLinkedIssues(body: string | null): LinkedIssueRef[] {
  if (!body) return [];
  const seen = new Set<string>();
  const results: LinkedIssueRef[] = [];
  for (const line of body.split(/\r?\n/)) {
    let match: RegExpExecArray | null;
    CLOSING_RE.lastIndex = 0;
    while ((match = CLOSING_RE.exec(line))) {
      const refsText = match[1];
      let refMatch: RegExpExecArray | null;
      REF_RE.lastIndex = 0;
      while ((refMatch = REF_RE.exec(refsText))) {
        const owner = refMatch[1] ?? null;
        const repo = refMatch[2] ?? null;
        const number = Number(refMatch[3]);
        const key = `${owner ?? ""}/${repo ?? ""}#${number}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({ owner, repo, number });
        }
      }
    }
  }
  return results;
}
