import type { PullRequestFile } from "./types";

/** Total added/removed line counts across every file's diff — GitHub's PR-commits API returns
 * no precomputed insertions/deletions (unlike local `CommitDetail`, which git2 computes for us),
 * so this sums it from the same hunk/line data already fetched for the diff viewer itself. */
export function diffStats(files: PullRequestFile[]) {
  let insertions = 0;
  let deletions = 0;
  for (const file of files) {
    for (const hunk of file.diff.hunks) {
      for (const line of hunk.lines) {
        if (line.kind === "addition") insertions++;
        else if (line.kind === "deletion") deletions++;
      }
    }
  }
  return { insertions, deletions };
}
