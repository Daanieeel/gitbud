import {
  FileCode2,
  FileJson,
  FileText,
  FileType,
  FileCog,
  FileTerminal,
  Image,
  Braces,
  Hash,
  type LucideIcon,
} from "lucide-react";

interface FileIconSpec {
  icon: LucideIcon;
  color: string;
}

const BY_EXTENSION: Record<string, FileIconSpec> = {
  ts: { icon: FileCode2, color: "var(--accent-blue)" },
  tsx: { icon: FileCode2, color: "var(--accent-blue)" },
  js: { icon: FileCode2, color: "var(--accent-yellow)" },
  jsx: { icon: FileCode2, color: "var(--accent-yellow)" },
  mjs: { icon: FileCode2, color: "var(--accent-yellow)" },
  py: { icon: FileCode2, color: "var(--accent-blue)" },
  rs: { icon: FileCode2, color: "#dea584" },
  go: { icon: FileCode2, color: "var(--accent-blue)" },
  java: { icon: FileCode2, color: "#e76f00" },
  rb: { icon: FileCode2, color: "var(--accent-pink)" },
  php: { icon: FileCode2, color: "var(--accent-purple)" },
  c: { icon: FileCode2, color: "var(--accent-blue)" },
  h: { icon: FileCode2, color: "var(--accent-blue)" },
  cpp: { icon: FileCode2, color: "var(--accent-blue)" },
  cs: { icon: FileCode2, color: "var(--accent-purple)" },
  swift: { icon: FileCode2, color: "var(--accent-yellow)" },
  kt: { icon: FileCode2, color: "var(--accent-purple)" },

  html: { icon: Braces, color: "#e34c26" },
  css: { icon: Hash, color: "var(--accent-blue)" },
  scss: { icon: Hash, color: "var(--accent-pink)" },
  less: { icon: Hash, color: "var(--accent-pink)" },

  json: { icon: FileJson, color: "var(--accent-yellow)" },
  yml: { icon: FileCog, color: "var(--accent-purple)" },
  yaml: { icon: FileCog, color: "var(--accent-purple)" },
  toml: { icon: FileCog, color: "var(--accent-purple)" },
  ini: { icon: FileCog, color: "var(--accent-purple)" },
  env: { icon: FileCog, color: "var(--accent-green)" },

  md: { icon: FileText, color: "var(--accent-blue)" },
  mdx: { icon: FileText, color: "var(--accent-blue)" },
  txt: { icon: FileText, color: "var(--muted-foreground)" },

  sh: { icon: FileTerminal, color: "var(--accent-green)" },
  bash: { icon: FileTerminal, color: "var(--accent-green)" },
  zsh: { icon: FileTerminal, color: "var(--accent-green)" },

  sql: { icon: FileType, color: "var(--accent-blue)" },

  png: { icon: Image, color: "var(--accent-purple)" },
  jpg: { icon: Image, color: "var(--accent-purple)" },
  jpeg: { icon: Image, color: "var(--accent-purple)" },
  gif: { icon: Image, color: "var(--accent-purple)" },
  svg: { icon: Image, color: "var(--accent-purple)" },
  webp: { icon: Image, color: "var(--accent-purple)" },
};

const DEFAULT_SPEC: FileIconSpec = { icon: FileText, color: "var(--muted-foreground)" };

export function getFileIcon(path: string): FileIconSpec {
  const ext = path.split(".").pop()?.toLowerCase();
  if (!ext) return DEFAULT_SPEC;
  return BY_EXTENSION[ext] ?? DEFAULT_SPEC;
}
