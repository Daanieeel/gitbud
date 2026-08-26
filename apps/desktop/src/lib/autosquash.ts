export type RebaseAction = "pick" | "squash" | "fixup" | "drop";

interface AutosquashCommit {
  oid: string;
  summary: string;
}

interface AutosquashRow<T extends AutosquashCommit> {
  commit: T;
  action: RebaseAction;
}

function parseAutosquashPrefix(
  summary: string,
): { action: "fixup" | "squash"; target: string } | null {
  const fixup = summary.match(/^fixup!\s+(.+)$/);
  if (fixup) return { action: "fixup", target: fixup[1] };
  const squash = summary.match(/^squash!\s+(.+)$/);
  if (squash) return { action: "squash", target: squash[1] };
  return null;
}

/** `git rebase --autosquash`, applied to an already-built pick list: any commit whose summary
 * starts with `fixup! ` or `squash! ` is moved to immediately follow the commit it names
 * (matched by summary, oldest first — the same order git itself resolves ties in) and marked
 * with the matching action, instead of staying a separate `pick` wherever it happened to land
 * in history. A fixup/squash commit with no match in `rows` (its target isn't part of this
 * rebase) is left alone as a plain pick, same as real git. */
export function applyAutosquash<T extends AutosquashCommit>(
  rows: AutosquashRow<T>[],
): AutosquashRow<T>[] {
  const result: AutosquashRow<T>[] = [];

  for (const row of rows) {
    const parsed = parseAutosquashPrefix(row.commit.summary);
    if (!parsed) {
      result.push(row);
      continue;
    }
    const targetIndex = result.findIndex((r) => r.commit.summary === parsed.target);
    if (targetIndex === -1) {
      result.push(row);
      continue;
    }
    // Stack after any fixups/squashes already placed on this same target, so a target with
    // multiple fixups keeps them in their original relative order.
    let insertAt = targetIndex + 1;
    while (
      insertAt < result.length &&
      parseAutosquashPrefix(result[insertAt].commit.summary)?.target === parsed.target
    ) {
      insertAt++;
    }
    result.splice(insertAt, 0, { commit: row.commit, action: parsed.action });
  }

  return result;
}
