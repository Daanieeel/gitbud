import { describe, expect, it } from "bun:test";
import { diffStats } from "./diffStats";
import type { PullRequestFile } from "./types";

function file(kinds: ("context" | "addition" | "deletion")[]): PullRequestFile {
  return {
    filename: "a.ts",
    status: "modified",
    diff: {
      path: "a.ts",
      old_path: null,
      is_binary: false,
      is_image: false,
      hunks: [
        {
          header: "@@ -1,1 +1,1 @@",
          lines: kinds.map((kind) => ({
            kind,
            content: "x",
            old_lineno: 1,
            new_lineno: 1,
            highlight_ranges: [],
          })),
        },
      ],
    },
  };
}

describe("diffStats", () => {
  it("counts additions and deletions across every file and hunk", () => {
    const stats = diffStats([file(["addition", "addition", "deletion", "context"])]);
    expect(stats).toEqual({ insertions: 2, deletions: 1 });
  });

  it("sums across multiple files", () => {
    const stats = diffStats([file(["addition"]), file(["deletion", "deletion"])]);
    expect(stats).toEqual({ insertions: 1, deletions: 2 });
  });

  it("returns zero for no files", () => {
    expect(diffStats([])).toEqual({ insertions: 0, deletions: 0 });
  });
});
