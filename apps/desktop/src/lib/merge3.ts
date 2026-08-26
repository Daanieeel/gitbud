import type { ConflictSides, DiffHunk } from "./types";

export type Pick = "ours" | "theirs" | "base";

export interface MergeBlock {
  id: string;
  baseStart: number;
  baseEnd: number;
  oursHunk: DiffHunk | null;
  theirsHunk: DiffHunk | null;
}

function hunkBaseRange(hunk: DiffHunk): [number, number] {
  const nums = hunk.lines.map((l) => l.old_lineno).filter((n): n is number => n != null);
  if (nums.length === 0) return [0, 0];
  return [Math.min(...nums), Math.max(...nums)];
}

function hunkSideLines(hunk: DiffHunk): string[] {
  return hunk.lines.filter((l) => l.kind !== "deletion").map((l) => l.content);
}

/** Merges ours/theirs hunks (each independently diffed against base) into blocks by overlapping
 * base line range. A block touched by only one side is an isolated, non-conflicting edit; a
 * block touched by both is a real conflict that needs a pick. */
export function buildMergeBlocks(sides: ConflictSides): MergeBlock[] {
  const items: { side: "ours" | "theirs"; hunk: DiffHunk; start: number; end: number }[] = [
    ...sides.ours.hunks.map((hunk) => {
      const [start, end] = hunkBaseRange(hunk);
      return { side: "ours" as const, hunk, start, end };
    }),
    ...sides.theirs.hunks.map((hunk) => {
      const [start, end] = hunkBaseRange(hunk);
      return { side: "theirs" as const, hunk, start, end };
    }),
  ];
  items.sort((a, b) => a.start - b.start);

  const blocks: MergeBlock[] = [];
  for (const item of items) {
    const overlapping = blocks.find((b) => item.start <= b.baseEnd && b.baseStart <= item.end);
    if (overlapping) {
      overlapping.baseStart = Math.min(overlapping.baseStart, item.start);
      overlapping.baseEnd = Math.max(overlapping.baseEnd, item.end);
      if (item.side === "ours") overlapping.oursHunk = item.hunk;
      else overlapping.theirsHunk = item.hunk;
    } else {
      blocks.push({
        id: `${item.start}-${item.end}-${item.side}-${blocks.length}`,
        baseStart: item.start,
        baseEnd: item.end,
        oursHunk: item.side === "ours" ? item.hunk : null,
        theirsHunk: item.side === "theirs" ? item.hunk : null,
      });
    }
  }
  blocks.sort((a, b) => a.baseStart - b.baseStart);
  return blocks;
}

export function isConflictBlock(block: MergeBlock): boolean {
  return block.oursHunk != null && block.theirsHunk != null;
}

export function blockBaseLines(sides: ConflictSides, block: MergeBlock): string[] {
  const hasTrailingNewline = sides.base_text.endsWith("\n");
  const allLines = sides.base_text.split("\n");
  const lines = hasTrailingNewline ? allLines.slice(0, -1) : allLines;
  const result: string[] = [];
  for (let ln = block.baseStart; ln <= block.baseEnd; ln++) {
    result.push(lines[ln - 1]);
  }
  return result;
}

export function hunkSideLinesForDisplay(hunk: DiffHunk | null): string[] {
  return hunk ? hunkSideLines(hunk) : [];
}

/** The pick a block would use if the user never touches it — "base" only for the
 * (shouldn't-happen) case of a block with no hunks on either side. */
export function defaultPick(block: MergeBlock): Pick | null {
  if (block.oursHunk && block.theirsHunk) return null;
  if (block.oursHunk) return "ours";
  if (block.theirsHunk) return "theirs";
  return "base";
}

/** Reconstructs the fully-resolved file text from base text + blocks + the user's picks
 * (falling back to each block's default pick when unset). */
export function reconstructFile(
  sides: ConflictSides,
  blocks: MergeBlock[],
  picks: Record<string, Pick>,
): string {
  const hasTrailingNewline = sides.base_text.endsWith("\n");
  const allLines = sides.base_text.split("\n");
  const lines = hasTrailingNewline ? allLines.slice(0, -1) : allLines;

  const out: string[] = [];
  let cursor = 1;
  for (const block of blocks) {
    for (let ln = cursor; ln < block.baseStart; ln++) {
      out.push(lines[ln - 1]);
    }
    const pick = picks[block.id] ?? defaultPick(block);
    if (pick === "ours" && block.oursHunk) {
      out.push(...hunkSideLines(block.oursHunk));
    } else if (pick === "theirs" && block.theirsHunk) {
      out.push(...hunkSideLines(block.theirsHunk));
    } else {
      for (let ln = block.baseStart; ln <= block.baseEnd; ln++) {
        out.push(lines[ln - 1]);
      }
    }
    cursor = Math.max(cursor, block.baseEnd + 1);
  }
  for (let ln = cursor; ln <= lines.length; ln++) {
    out.push(lines[ln - 1]);
  }

  return out.join("\n") + (hasTrailingNewline ? "\n" : "");
}
