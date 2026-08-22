/** Splits a repo-relative path into its directory prefix (no trailing slash, empty for a
 * top-level file) and filename, so the two can be styled/truncated differently. */
export function splitPath(path: string): { dir: string; base: string } {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? { dir: "", base: path } : { dir: path.slice(0, idx), base: path.slice(idx + 1) };
}

/** Renders a file path with the directory dimmed and truncated from the left, while the
 * separating slash and the filename itself always stay fully visible. */
export function FilePathLabel({ path, className }: { path: string; className?: string }) {
  const { dir, base } = splitPath(path);
  return (
    <span className={className ?? "flex min-w-0 flex-1 items-center"}>
      {dir && (
        <>
          <span className="truncate text-muted-foreground/70">{dir}</span>
          <span className="shrink-0 text-muted-foreground/70">/</span>
        </>
      )}
      <span className="shrink-0">{base}</span>
    </span>
  );
}
