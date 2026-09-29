Implement this function in `solution.ts`:

```ts
export function replayInventory(events: string[]): [string, number][];
```

A warehouse keeps a stock count for each item, starting from nothing. You are given its event log in order. Each event is one of:

- `"add <item> <qty>"`: increase the stock of `<item>` by `<qty>`.
- `"remove <item> <qty>"`: decrease the stock of `<item>` by `<qty>`. If the item currently has fewer than `<qty>` in stock, the remove is rejected: it changes nothing and is not recorded at all, as if it had never appeared in the log.
- `"undo"`: revert the most recent recorded add or remove that has not already been undone.
- `"redo"`: re-apply the add or remove that was most recently undone and has not been re-applied since.

Every add, and every remove that is not rejected, is a recorded action. Recording a new action discards everything that could have been redone, so a `"redo"` right after it does nothing. A rejected remove is not recorded, so it neither discards what could be redone nor becomes something `"undo"` can revert. An `"undo"` with nothing left to undo, or a `"redo"` with nothing to redo, does nothing.

After processing every event, return `[item, quantity]` for each item whose stock is greater than zero, sorted by item name in plain character-code order (compare the strings with `<`, not locale rules). Items whose stock is zero are left out, so an empty log gives `[]`.

Example: for `["add apple 5", "remove apple 2", "remove pear 1", "undo", "add pear 4", "redo"]` the pear remove is rejected, the undo reverts `remove apple 2`, adding pear discards the pending redo, and the final `"redo"` does nothing, so the result is `[["apple", 5], ["pear", 4]]`.

Constraints:

- `0 <= events.length <= 200000`
- `<item>` is 1 to 10 lowercase English letters; `<qty>` is an integer from 1 to 10^9 written without leading zeros.
- Words in an event are separated by a single space, with no other whitespace.

Keep the exported name and signature exactly as shown. `solution.ts` must be self-contained: no imports other than Node built-ins.
