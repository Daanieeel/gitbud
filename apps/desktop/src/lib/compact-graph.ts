import type { CommitEntry } from "@/lib/types";

/** Collapses the full multi-branch graph down to just the current branch's own history: the
 * first-parent chain from the newest commit (always HEAD, since `get_log` walks from there).
 * Everything reachable only through a merge's other parents — i.e. commits that live entirely
 * on some branch merged into this one — is dropped rather than drawn as its own lane, so a
 * long-lived feature branch doesn't clutter the graph with a lane that runs for its entire
 * separate history. Merge commits themselves stay (they're on the mainline by definition). */
export function toMainlineCommits(commits: CommitEntry[]): CommitEntry[] {
  if (commits.length === 0) return commits;

  const byOid = new Map(commits.map((c) => [c.oid, c]));
  const mainline = new Set<string>();
  let cur: string | undefined = commits[0].oid;
  while (cur && byOid.has(cur) && !mainline.has(cur)) {
    mainline.add(cur);
    cur = byOid.get(cur)!.parent_ids[0];
  }

  return commits
    .filter((c) => mainline.has(c.oid))
    .map((c) => ({
      ...c,
      lane: 0,
      parent_lanes: c.parent_ids[0] && mainline.has(c.parent_ids[0]) ? [0] : [],
      active_lanes: [0],
    }));
}
