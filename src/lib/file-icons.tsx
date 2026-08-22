import { FileIcon } from "@react-symbols/icons/utils";

interface FileTypeIconProps {
  path: string;
  className?: string;
}

/** Renders the VSCode "Symbols" file icon (via @react-symbols/icons) for a given path,
 * matching on both special file names (e.g. "package.json", "Dockerfile") and extension. */
export function FileTypeIcon({ path, className }: FileTypeIconProps) {
  const fileName = path.split("/").pop() ?? path;
  return <FileIcon fileName={fileName} autoAssign className={className} />;
}
