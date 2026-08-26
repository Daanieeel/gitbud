#!/usr/bin/env bun
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * §14.14: an unreferenced export anywhere in the repo is dead code. Dead code
 * is worse here than usual — an agent reading the tree cannot tell which of two
 * similar helpers is the live one, so it picks the wrong one and the wrong one
 * grows.
 *
 * Deliberately conservative: it reports a symbol only when NO file anywhere
 * mentions it by name. That misses a symbol referenced only in a comment, and
 * it never invents a false positive over a re-export chain, which is the trade
 * a check people actually keep green has to make.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const SKIP_DIRS = new Set([
	'node_modules',
	'generated',
	'.next',
	'.turbo',
	'dist',
	'out',
	'build',
	'.output',
	'prisma',
]);

/** Entry points are referenced by tooling, not by an import. */
const ENTRY_FILES = new Set([
	'index.ts',
	'environment.ts',
	'manifest.ts',
	'proxy.ts',
	'env.js',
]);

/**
 * Exports a framework invokes by convention — Next.js route files, TanStack
 * Router route modules — never by an in-source reference. They are "used" by
 * the framework, so a name-scan cannot see it.
 */
const FRAMEWORK_EXPORTS = new Set([
	'default',
	'metadata',
	'generateMetadata',
	'generateStaticParams',
	'generateViewport',
	'viewport',
	'dynamic',
	'revalidate',
	'fetchCache',
	'runtime',
	'preferredRegion',
	'maxDuration',
	'Route',
	'loader',
	'action',
	'config',
	'middleware',
	'proxy',
]);

/** Route files whose default/segment exports the framework wires by path. */
function isFrameworkRouteFile(rel: string): boolean {
	return (
		/\/app\/.*\/(page|layout|loading|error|not-found|route|template|default|head|opengraph-image|sitemap|robots|manifest)\.tsx?$/.test(
			rel
		) || /\/routes\/.*\.tsx?$/.test(rel)
	);
}

type ScanFrame =
	| {
			readonly kind: 'code';
			readonly interpolation: boolean;
			braceDepth: number;
	  }
	| { readonly kind: 'template' };

/**
 * Blanks out block/line comments and quoted strings so a name that survives only
 * inside one of them does not read as a reference, while keeping template-literal
 * `${…}` interpolations (which hold real references) intact.
 *
 * A single left-to-right scanner rather than sequential regexes: `//` inside a
 * URL string ('https://…', 'wss://…') is NOT a line comment, and an apostrophe
 * inside a double-quoted string ("didn't") is NOT a string delimiter. Regex
 * passes that ignore lexical context blanked whole file bodies at those tokens
 * and reported live exports as dead. Emits a space per consumed construct so
 * nothing outside is accidentally joined.
 */
function stripCommentsAndStrings(source: string): string {
	const out: string[] = [];
	const stack: ScanFrame[] = [
		{ kind: 'code', interpolation: false, braceDepth: 0 },
	];
	const n = source.length;
	let i = 0;

	while (i < n) {
		const frame = stack[stack.length - 1];
		if (frame === undefined) break;
		const c = source[i] ?? '';
		const next = i + 1 < n ? (source[i + 1] ?? '') : '';

		if (frame.kind === 'template') {
			if (c === '\\') {
				out.push(' ');
				i += 2;
				continue;
			}
			if (c === '`') {
				out.push(' ');
				stack.pop();
				i += 1;
				continue;
			}
			if (c === '$' && next === '{') {
				out.push(' ');
				stack.push({
					kind: 'code',
					interpolation: true,
					braceDepth: 0,
				});
				i += 2;
				continue;
			}
			// Keep the literal's text: its identifiers may be real references.
			out.push(c);
			i += 1;
			continue;
		}

		if (c === '/' && next === '*') {
			i += 2;
			while (i < n && !(source[i] === '*' && source[i + 1] === '/'))
				i += 1;
			i += 2;
			out.push(' ');
			continue;
		}
		if (c === '/' && next === '/') {
			i += 2;
			while (i < n && source[i] !== '\n') i += 1;
			out.push(' ');
			continue;
		}
		if (c === "'" || c === '"') {
			i += 1;
			// A quoted string never spans a raw newline. Stopping there bounds the
			// damage when the opening quote is not really a string start (e.g. a
			// quote inside a regex literal, which this scanner does not model) to a
			// single line instead of letting it swallow the rest of the file.
			while (i < n && source[i] !== c && source[i] !== '\n') {
				if (source[i] === '\\') i += 1;
				i += 1;
			}
			if (source[i] === c) i += 1;
			out.push(' ');
			continue;
		}
		if (c === '`') {
			out.push(' ');
			stack.push({ kind: 'template' });
			i += 1;
			continue;
		}
		if (c === '{') {
			frame.braceDepth += 1;
			out.push(c);
			i += 1;
			continue;
		}
		if (c === '}') {
			if (frame.interpolation && frame.braceDepth === 0) {
				out.push(' ');
				stack.pop();
				i += 1;
				continue;
			}
			frame.braceDepth -= 1;
			out.push(c);
			i += 1;
			continue;
		}
		out.push(c);
		i += 1;
	}
	return out.join('');
}

async function walk(dir: string): Promise<string[]> {
	const out: string[] = [];
	const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (SKIP_DIRS.has(entry.name)) continue;
			out.push(...(await walk(full)));
			continue;
		}
		if (/\.tsx?$/.test(entry.name)) out.push(full);
	}
	return out;
}

const EXPORT_PATTERNS = [
	/^export\s+(?:async\s+)?function\s+(\w+)/gm,
	/^export\s+(?:abstract\s+)?class\s+(\w+)/gm,
	/^export\s+const\s+(\w+)/gm,
	/^export\s+interface\s+(\w+)/gm,
	/^export\s+type\s+(\w+)/gm,
	/^export\s+enum\s+(\w+)/gm,
];

interface Exported {
	readonly name: string;
	readonly file: string;
	readonly line: number;
}

function collectExports(rel: string, source: string): Exported[] {
	const found: Exported[] = [];
	for (const pattern of EXPORT_PATTERNS) {
		for (const match of source.matchAll(pattern)) {
			const name = match[1];
			if (name === undefined) continue;
			const line = source.slice(0, match.index).split('\n').length;
			found.push({ name, file: rel, line });
		}
	}
	return found;
}

async function main(): Promise<number> {
	const files = [
		...(await walk(join(ROOT, 'apps'))),
		...(await walk(join(ROOT, 'packages'))),
	];
	const sources = new Map<string, string>();
	for (const file of files) {
		sources.set(relative(ROOT, file), await readFile(file, 'utf8'));
	}

	const exported: Exported[] = [];
	for (const [rel, source] of sources) {
		const base = rel.split('/').pop() ?? '';
		if (ENTRY_FILES.has(base)) continue;
		if (rel.includes('.test.') || rel.includes('__tests__')) continue;
		exported.push(...collectExports(rel, source));
	}

	// Total occurrences of every identifier across the repo, in one linear pass.
	// A symbol used only as a field type inside its declaring file IS referenced
	// — §14.14 flags UNreferenced exports, so the test is total occurrences, not
	// cross-file presence. An export whose name appears exactly once (its own
	// declaration) is dead; two or more means something references it.
	//
	// Comments and string literals are stripped first: a name kept "alive" only
	// by a JSDoc example or a `this.name = 'Foo'` string is still dead code.
	const occurrences = new Map<string, number>();
	for (const source of sources.values()) {
		for (const token of stripCommentsAndStrings(source).matchAll(
			/[A-Za-z_$][\w$]*/g
		)) {
			const name = token[0];
			occurrences.set(name, (occurrences.get(name) ?? 0) + 1);
		}
	}

	const dead = exported.filter(
		(symbol) =>
			(occurrences.get(symbol.name) ?? 0) <= 1 &&
			!FRAMEWORK_EXPORTS.has(symbol.name) &&
			!isFrameworkRouteFile(symbol.file)
	);

	if (dead.length === 0) {
		process.stdout.write(
			`no unreferenced exports (${exported.length} checked)\n`
		);
		return 0;
	}
	process.stdout.write(
		`§14.14 unreferenced export — ${dead.length} violation(s)\n`
	);
	for (const symbol of dead) {
		process.stdout.write(
			`  ${symbol.file}:${symbol.line}  ${symbol.name}\n`
		);
	}
	process.stdout.write(
		'  fix: delete it, or stop exporting it if it is module-internal\n'
	);
	return 1;
}

process.exit(await main());
