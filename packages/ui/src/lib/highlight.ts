import hljs from "highlight.js/lib/core";

// Loaded on first use rather than all up front: most sessions only ever touch a handful of
// these languages, and eagerly importing+registering all ~19 grammars costs real memory the
// moment any diff renders, whether or not most of them are ever needed.
/** Looks up an open string key against a known-literal lookup table without widening the
 * table's own declared type — the table stays `satisfies`-checked against its value type, and
 * only this generic boundary (not the table itself) admits an arbitrary `string` key. */
function lookup<T>(map: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(map, key) ? map[key] : undefined;
}

const LANGUAGE_LOADERS = {
  typescript: () => import("highlight.js/lib/languages/typescript"),
  javascript: () => import("highlight.js/lib/languages/javascript"),
  xml: () => import("highlight.js/lib/languages/xml"),
  css: () => import("highlight.js/lib/languages/css"),
  json: () => import("highlight.js/lib/languages/json"),
  python: () => import("highlight.js/lib/languages/python"),
  rust: () => import("highlight.js/lib/languages/rust"),
  go: () => import("highlight.js/lib/languages/go"),
  java: () => import("highlight.js/lib/languages/java"),
  ruby: () => import("highlight.js/lib/languages/ruby"),
  php: () => import("highlight.js/lib/languages/php"),
  cpp: () => import("highlight.js/lib/languages/cpp"),
  csharp: () => import("highlight.js/lib/languages/csharp"),
  bash: () => import("highlight.js/lib/languages/bash"),
  yaml: () => import("highlight.js/lib/languages/yaml"),
  markdown: () => import("highlight.js/lib/languages/markdown"),
  sql: () => import("highlight.js/lib/languages/sql"),
  ini: () => import("highlight.js/lib/languages/ini"),
} satisfies Record<string, () => Promise<{ default: unknown }>>;

const loadedLanguages = new Set<string>();
const pendingLoads = new Map<string, Promise<void>>();

/** Kicks off (and memoizes) loading + registering a language's grammar on first use. Returns a
 * promise that resolves once `highlightLine` can actually use it, or `undefined` if it's already
 * loaded/unsupported. Callers re-render once the promise resolves; `highlightLine` itself stays
 * synchronous and just renders plain (unhighlighted) text until then. */
export function ensureLanguageLoaded(language: string | undefined): Promise<void> | undefined {
  if (!language || loadedLanguages.has(language)) return undefined;
  const existing = pendingLoads.get(language);
  if (existing) return existing;
  const loader = lookup(LANGUAGE_LOADERS, language);
  if (!loader) return undefined;
  const pending = loader().then((mod) => {
    // SAFETY: every entry in LANGUAGE_LOADERS is a highlight.js language grammar module (see the
    // list above) — hljs guarantees each one's `default` export is a LanguageFn.
    hljs.registerLanguage(language, mod.default as Parameters<typeof hljs.registerLanguage>[1]);
    loadedLanguages.add(language);
  });
  pendingLoads.set(language, pending);
  return pending;
}

const EXT_TO_LANG = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  html: "xml",
  htm: "xml",
  xml: "xml",
  css: "css",
  scss: "css",
  less: "css",
  json: "json",
  py: "python",
  rs: "rust",
  go: "go",
  java: "java",
  kt: "java",
  rb: "ruby",
  php: "php",
  c: "cpp",
  h: "cpp",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  cs: "csharp",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  yml: "yaml",
  yaml: "yaml",
  md: "markdown",
  mdx: "markdown",
  sql: "sql",
  toml: "ini",
  ini: "ini",
  cfg: "ini",
} satisfies Record<string, string>;

export function languageForPath(path: string): string | undefined {
  const ext = path.split(".").pop()?.toLowerCase();
  return ext ? lookup(EXT_TO_LANG, ext) : undefined;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Highlights a single line in isolation — loses cross-line grammar state (e.g. mid
 * multi-line comment/string) like most diff viewers' per-line highlighting does. Renders as
 * plain escaped text if `language`'s grammar hasn't finished loading yet (see
 * `ensureLanguageLoaded`); callers trigger that and re-render once it resolves. */
export function highlightLine(content: string, language: string | undefined): string {
  if (!language || !loadedLanguages.has(language)) return escapeHtml(content);
  try {
    return hljs.highlight(content, { language, ignoreIllegals: true }).value;
  } catch {
    return escapeHtml(content);
  }
}

/** Overlays character-offset ranges (the backend's intraline diff) onto HTML already produced
 * by `highlightLine`, wrapping the covered plain-text characters in a highlight span so syntax
 * highlighting and diff highlighting both show at once. Offsets count each HTML entity
 * (`&amp;`, `&lt;`, `&gt;`) as the one character it represents and tags as contributing no
 * characters, matching how `highlightLine`/`escapeHtml` produced the HTML.
 *
 * A highlighted range can legally start or end in the middle of an existing token `<span>` (a
 * syntax-highlight boundary and a diff-highlight boundary have no reason to line up). Naively
 * inserting our own `<span>...</span>` across such a boundary produces invalid nesting that a
 * real HTML parser resolves by stack discipline, not by "what we meant" — e.g. a literal closing
 * tag encountered while our span is still open closes *our* span (it's innermost), silently
 * dropping the highlight for everything after it in that token. To avoid depending on that, we
 * never let our span cross a tag: it's closed right before any tag and reopened right after, if
 * the highlighted range continues past it. */
export function applyHighlightRanges(
  html: string,
  ranges: [number, number][],
  className: string,
): string {
  if (ranges.length === 0) return html;
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);

  let result = "";
  let textPos = 0;
  let rangeIdx = 0;
  let open = false;
  let i = 0;

  const isInRange = () => {
    while (rangeIdx < sorted.length && sorted[rangeIdx][1] <= textPos) rangeIdx++;
    return (
      rangeIdx < sorted.length && sorted[rangeIdx][0] <= textPos && textPos < sorted[rangeIdx][1]
    );
  };

  while (i < html.length) {
    if (html[i] === "<") {
      const close = html.indexOf(">", i);
      const end = close === -1 ? html.length : close + 1;
      if (open) {
        result += "</span>";
        open = false;
      }
      result += html.slice(i, end);
      i = end;
      if (isInRange()) {
        result += `<span class="${className}">`;
        open = true;
      }
      continue;
    }

    let charLen = 1;
    if (html[i] === "&") {
      const semi = html.indexOf(";", i);
      if (semi !== -1 && semi - i <= 6) charLen = semi - i + 1;
    }

    const inRange = isInRange();
    if (inRange && !open) {
      result += `<span class="${className}">`;
      open = true;
    } else if (!inRange && open) {
      result += "</span>";
      open = false;
    }

    result += html.slice(i, i + charLen);
    i += charLen;
    textPos += 1;
  }
  if (open) result += "</span>";
  return result;
}
