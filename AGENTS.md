Bun/Turborepo monorepo: the desktop app is `apps/desktop/` (its `src/` is what `@/*` resolves to below), shared UI components + Tailwind theme are `packages/ui/` (imported as `@gitbud/ui/*`).

Never use en/em dashes in texts

Make sure that [ALL_FEATURES.md](ALL_FEATURES.md) stays up to date

Avoid nested/chained ternaries for a "first matching reason" value (e.g. a disabled-button explanation with several possible causes). Use `firstMatch` from `@/lib/utils` with an ordered `[condition, value]` list instead — it's generic over the value type, so each entry keeps its own literal type and the tuple shape (`[boolean, T]`) is checked at compile time, rather than hand-rolling `.find(...)?.[1]`:

```ts
import { firstMatch } from "@/lib/utils";

const disabledReason = firstMatch([
  [!hasOtherBranch, "No branch to open into"],
  [!hasCommits, "No commits yet"],
  [!hasPushedCommit, "Need at least one pushed commit"],
]);
```

No `switch`, no if-else chains, no ternary chains for value-per-case logic. Use a map, key = matched value:

```ts
type Status = "open" | "closed" | "merged";

const labels: Record<Status, string> = { open: "Open", closed: "Closed", merged: "Merged" };
const label = labels[status];
```

Same for behavior, map key to an inline function:

```ts
type Status = "open" | "closed" | "merged";

const handlers: Record<Status, (item: PullRequest) => void> = {
  open: (item: PullRequest) => openBranch(item),
  closed: (item: PullRequest) => reopenIssue(item),
  merged: (item: PullRequest) => showDiff(item),
};
handlers[status](item);
```
