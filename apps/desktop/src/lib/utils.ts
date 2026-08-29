import type { FileDiff } from "@/lib/types";

const PROTECTED_BRANCH_NAMES = new Set(["main", "master"]);

export function isProtectedBranch(name: string): boolean {
  return PROTECTED_BRANCH_NAMES.has(name);
}

const WHITESPACE_ONLY_THRESHOLD = 0.9;

/** Whether a diff's changed lines are almost entirely whitespace (indentation, blank lines,
 * trailing spaces) rather than real content edits, e.g. after running a formatter. Ratio is
 * measured over changed-line characters, not the whole file, and kept high so genuine edits
 * that merely touch a mostly-whitespace line don't get misclassified. */
export function isWhitespaceOnlyDiff(diff: FileDiff): boolean {
  let whitespaceChars = 0;
  let totalChars = 0;
  for (const hunk of diff.hunks) {
    for (const line of hunk.lines) {
      if (line.kind === "context") continue;
      // `content` excludes the line's own trailing newline, so count it separately —
      // otherwise a purely inserted/deleted blank line contributes nothing at all.
      totalChars += line.content.length + 1;
      whitespaceChars += 1;
      for (const ch of line.content) {
        if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") whitespaceChars++;
      }
    }
  }
  if (totalChars === 0) return false;
  return whitespaceChars / totalChars >= WHITESPACE_ONLY_THRESHOLD;
}

/** Returns the value paired with the first true condition, or `null` if none matched. Reads as
 * an ordered list of (condition, value) rules instead of a nested/chained ternary — e.g. picking
 * the first applicable reason a button is disabled. `T` is inferred per call, so each value stays
 * its own literal type rather than widening to `string`. */
export function firstMatch<T>(
  cases: ReadonlyArray<readonly [condition: boolean, value: T]>,
): T | null {
  return cases.find(([condition]) => condition)?.[1] ?? null;
}
