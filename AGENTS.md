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
