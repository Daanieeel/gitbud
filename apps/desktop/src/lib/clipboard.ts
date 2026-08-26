export async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard access denied or unavailable — silently no-op rather than throw
    // into a context-menu click handler the user can't see the error from.
  }
}
