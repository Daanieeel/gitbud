const PROTECTED_BRANCH_NAMES = new Set(["main", "master"]);

export function isProtectedBranch(name: string): boolean {
  return PROTECTED_BRANCH_NAMES.has(name);
}

/** Returns the value paired with the first true condition, or `null` if none matched. Reads as
 * an ordered list of (condition, value) rules instead of a nested/chained ternary — e.g. picking
 * the first applicable reason a button is disabled. `T` is inferred per call, so each value stays
 * its own literal type rather than widening to `string`. */
export function firstMatch<T>(cases: ReadonlyArray<readonly [condition: boolean, value: T]>): T | null {
  return cases.find(([condition]) => condition)?.[1] ?? null;
}
