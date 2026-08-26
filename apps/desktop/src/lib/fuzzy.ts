/** VS Code "Go to Anything"-style fuzzy match: `needle`'s characters must appear in `haystack`
 * in order (case-insensitive), but not necessarily contiguously. Returns `null` for no match,
 * otherwise a score where higher means more relevant — consecutive runs, matches right at the
 * start of the string or right after a separator/camelCase boundary, and tighter/shorter overall
 * matches all score higher, so "goto anything" typing ("gtany") ranks a `GoToAnything.ts` file
 * above an unrelated file that merely happens to contain the same letters in order. */
export function fuzzyScore(needle: string, haystack: string): number | null {
  if (!needle) return 0;
  if (!haystack) return null;

  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();

  let score = 0;
  let searchFrom = 0;
  let consecutive = 0;
  let firstMatchIndex = -1;
  let lastMatchIndex = -1;

  for (let i = 0; i < n.length; i++) {
    const index = h.indexOf(n[i], searchFrom);
    if (index === -1) return null;
    if (firstMatchIndex === -1) firstMatchIndex = index;

    if (index === lastMatchIndex + 1) {
      consecutive++;
      score += 5 + consecutive * 3;
    } else {
      consecutive = 0;
      score += 1;
    }

    if (index === 0) {
      score += 8;
    } else {
      const prev = haystack[index - 1];
      const cur = haystack[index];
      if (prev === "/" || prev === "-" || prev === "_" || prev === " " || prev === ".") {
        score += 6;
      } else if (/[a-z0-9]/.test(prev) && /[A-Z]/.test(cur)) {
        score += 4;
      }
    }

    lastMatchIndex = index;
    searchFrom = index + 1;
  }

  const span = lastMatchIndex - firstMatchIndex + 1;
  score -= span * 0.5;
  score -= haystack.length * 0.05;

  return score;
}
