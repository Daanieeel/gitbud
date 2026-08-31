import { createLowlight } from "lowlight";
import bash from "highlight.js/lib/languages/bash";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

/** `lowlight` keeps its own independent grammar registry (it doesn't share a `highlight.js`
 * instance's global registration state), so it can't reuse `@gitbud/ui`'s lazily-loaded-on-first-
 * use registry as-is. Rather than wire up on-demand loading a second time for a different
 * library's registry (`CodeBlockLowlight` re-highlights synchronously on every keystroke — there's
 * no natural place to await a dynamic import mid-decoration), this eagerly registers the same 18
 * languages `@gitbud/ui`'s renderer lazily loads, paid once when the editor itself mounts rather
 * than per-keystroke. */
export const lowlight = createLowlight({
  bash,
  cpp,
  csharp,
  css,
  go,
  ini,
  java,
  javascript,
  json,
  markdown,
  php,
  python,
  ruby,
  rust,
  sql,
  typescript,
  xml,
  yaml,
});

lowlight.registerAlias({
  xml: ["html"],
  ini: ["toml"],
  typescript: ["ts", "tsx"],
  javascript: ["js", "jsx"],
});
