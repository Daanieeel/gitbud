/** Narrows a `@tauri-apps/plugin-dialog` `open()` result down to a single chosen path (`null`
 * means the user cancelled; a `string[]` only ever occurs when the caller passes `multiple:
 * true`, which none of the single-path pickers in this app do). */
export function isSinglePath(value: string | string[] | null): value is string {
  return typeof value === "string";
}
