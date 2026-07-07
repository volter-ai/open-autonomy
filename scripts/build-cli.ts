#!/usr/bin/env bun
// Build the self-contained, Node-runnable `open-autonomy` CLI published to npm.
//
// The library is bun-native (TS run directly) but uses the portable `yaml` lib (not Bun.YAML) on the
// compile path, so `bun build --target=node` produces a bundle that runs under plain `node`. The emit
// code reads sibling DATA files relative to import.meta.url (the runtime backends + the github runtime
// mirror); the bundle keeps import.meta.url pointing at dist/, so we copy those files next to the
// bundle. The result runs under plain `node` (hence `npx open-autonomy`) with no bun required.
//
// DATA_FILES below is the ONE place a new sibling data file must be registered — see the module-scope
// `readFileSync(join(dirname(fileURLToPath(import.meta.url)), '<literal>'))` idiom in the emit modules.
// Forgetting an entry here used to surface as a silent runtime ENOENT in a published tarball (see
// docs/adoption-fixes/OA-01-broken-npm-publish-egress-guard.md); the manifest + the static idiom scan
// below turn that into a build-time failure instead.
import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const DIST = 'dist';
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

const build = spawnSync(
  'bun',
  ['build', 'bin/open-autonomy.ts', '--target=node', '--outfile', `${DIST}/cli.js`],
  { stdio: 'inherit' },
);
if (build.status) process.exit(build.status ?? 1);

// Data files the bundled emit reads at runtime via import.meta.url (now resolving to dist/). Each entry
// is [source path (repo-root relative), dest path relative to DIST]. A `dir: true` entry is copied
// recursively (cpSync) rather than as a single file (copyFileSync).
const DATA_FILES = [
  { src: 'packages/substrate-local/src/backend.mjs', dest: 'backend.mjs' },
  { src: 'packages/substrate-local/src/runner-frontend.ts', dest: 'runner-frontend.ts' },
  { src: 'packages/substrate-github/src/control-backend.mjs', dest: 'control-backend.mjs' },
  { src: 'packages/substrate-github/src/egress-guard.sh', dest: 'egress-guard.sh' },
  { src: 'packages/substrate-github/src/runtime', dest: 'runtime', dir: true },
] as const;

for (const f of DATA_FILES) {
  const destPath = `${DIST}/${f.dest}`;
  if ('dir' in f && f.dir) cpSync(f.src, destPath, { recursive: true });
  else copyFileSync(f.src, destPath);
}

// Post-copy existence assertion: fail the BUILD (not a downstream `npx` install) if a declared data file
// didn't actually land next to the bundle.
const missingDataFiles = DATA_FILES.filter((f) => !existsSync(`${DIST}/${f.dest}`));
if (missingDataFiles.length) {
  console.error(
    `build-cli: ${missingDataFiles.length} declared data file(s) missing from ${DIST}/ after copy:\n` +
      missingDataFiles.map((f) => `  ${f.src} -> ${DIST}/${f.dest}`).join('\n'),
  );
  process.exit(1);
}

// --- Static scan: catch the NEXT unregistered sibling-read before it ships. ---------------------------
// Every current sibling read in this codebase follows one idiom: a module-scope (or `here`-memoized)
// `join(dirname(fileURLToPath(import.meta.url)), '<literal>', ...)`. Because the bundle's import.meta.url
// resolves to dist/cli.js, every such literal must resolve (join'd onto DIST) to something that exists
// after the copies above — otherwise it's the same class of bug this build is guarding against.
//
// Scanned: packages/*/src/*.ts and bin/*.ts (direct children only — this already excludes nested dirs
// like src/runtime/, the vendored runtime mirror, whose own import.meta.url usage runs in the COMPILED
// INSTALL, not this bundle). Excluded: *.test.ts, and any file that is itself one of DATA_FILES' `.ts`
// sources (e.g. runner-frontend.ts) — those are copied verbatim as DATA and executed in a different
// process/directory (a compiled install's scripts/), so their own import.meta.url reads are not this
// bundle's concern.
const SIBLING_IDIOM = 'dirname(fileURLToPath(import.meta.url))';
const dataFileSources = new Set<string>(DATA_FILES.filter((f) => !('dir' in f && f.dir)).map((f) => f.src));

function scannableSources(): string[] {
  const out: string[] = [];
  for (const dir of readdirSync('packages')) {
    const srcDir = join('packages', dir, 'src');
    if (!existsSync(srcDir) || !statSync(srcDir).isDirectory()) continue;
    for (const f of readdirSync(srcDir)) {
      if (!f.endsWith('.ts') || f.endsWith('.test.ts')) continue;
      const p = join(srcDir, f);
      if (dataFileSources.has(p)) continue;
      out.push(p);
    }
  }
  for (const f of readdirSync('bin')) {
    if (!f.endsWith('.ts') || f.endsWith('.test.ts')) continue;
    const p = join('bin', f);
    if (dataFileSources.has(p)) continue;
    out.push(p);
  }
  return out;
}

// Parse the comma-separated argument list of a `join(...)` call whose first argument is the sibling-dir
// idiom (or a variable bound to it), starting just after the opening paren. Returns the literal string
// arguments that follow (skipping the first, which is the dir expression itself), or `undefined` if any
// remaining argument isn't a plain single/double-quoted string literal (can't statically resolve — skip,
// don't false-positive).
function parseJoinLiteralArgs(src: string, openParenIdx: number): string[] | undefined {
  let depth = 1;
  let i = openParenIdx + 1;
  let args = '';
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) break; }
    args += c;
    i++;
  }
  // The first comma-separated part is always the dir expression itself (the idiom, or the identifier
  // bound to it) — the caller already confirmed that; only the REMAINING parts are candidate literals.
  const parts = args.split(',').map((s) => s.trim()).filter(Boolean).slice(1);
  const literals: string[] = [];
  for (const part of parts) {
    const m = /^(['"])(.*)\1$/.exec(part);
    if (!m) return undefined; // a dynamic (non-literal) argument — can't statically verify
    literals.push(m[2]!);
  }
  return literals;
}

// Some emit modules build OTHER runtimes' source text as backtick template literals (e.g. the local
// substrate's LOOP_DRIVER / RUN_AGENT_DRIVER strings, which are generated code for the COMPILED
// INSTALL's scheduler/, not this module). Those template bodies can themselves contain the sibling-read
// idiom (that generated script has its own, unrelated import.meta.url) — a plain text scan would mistake
// that for a real module-scope read here. Compute the character ranges covered by backtick template
// literal BODIES so matches inside them can be excluded. Escaped backticks (\`) inside a body are skipped
// so an escaped inner template doesn't end the range early. NOTE: `${…}` interpolations are NOT specially
// handled — an interpolation's expression text is treated as part of the literal body (i.e. also excluded
// from the scan). That is sufficient for the current codebase: no real sibling read lives inside a
// template interpolation, and a nested backtick inside `${…}` would mis-split ranges — none exist today.
function templateLiteralRanges(src: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '`') {
      const start = i + 1;
      i++;
      while (i < n) {
        if (src[i] === '\\') { i += 2; continue; }
        if (src[i] === '`') break;
        i++;
      }
      ranges.push([start, i]);
      i++;
      continue;
    }
    if (c === "'" || c === '"') {
      const quote = c;
      i++;
      while (i < n && src[i] !== quote) { if (src[i] === '\\') i++; i++; }
      i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    i++;
  }
  return ranges;
}

function insideAny(ranges: Array<[number, number]>, idx: number): boolean {
  return ranges.some(([s, e]) => idx >= s && idx < e);
}

// Given full source text, find every `join(<dirExpr>, 'lit', ...)` call where `<dirExpr>` is either the
// inline idiom or a bare identifier, and `identIsSiblingDir(ident)` says that identifier was assigned
// from the idiom earlier in the file. Returns the literal segments AFTER the dir expression for each call.
// Skips any match that falls inside a template-literal body (generated-code text, not a real read here).
function findJoinCalls(src: string, identIsSiblingDir: (ident: string) => boolean, litRanges: Array<[number, number]>): string[][] {
  const results: string[][] = [];
  const joinCallRe = /join\(\s*/g;
  let m: RegExpExecArray | null;
  while ((m = joinCallRe.exec(src))) {
    if (insideAny(litRanges, m.index)) continue;
    const afterParen = m.index + m[0].length;
    // Inline idiom: join(dirname(fileURLToPath(import.meta.url)), ...)
    if (src.startsWith(SIBLING_IDIOM, afterParen)) {
      const rest = parseJoinLiteralArgs(src, m.index + 'join('.length - 1);
      if (rest) results.push(rest);
      continue;
    }
    // join(<identifier>, ...) — check if identifier resolves to the sibling dir.
    const identMatch = /^([A-Za-z_$][\w$]*)\s*,/.exec(src.slice(afterParen));
    if (identMatch && identIsSiblingDir(identMatch[1]!)) {
      const rest = parseJoinLiteralArgs(src, m.index + 'join('.length - 1);
      if (rest) results.push(rest);
    }
  }
  return results;
}

const violations: string[] = [];
for (const file of scannableSources()) {
  const src = readFileSync(file, 'utf8');
  if (!src.includes(SIBLING_IDIOM)) continue;

  const litRanges = templateLiteralRanges(src);

  // Identifiers bound to the sibling dir: `const X = dirname(fileURLToPath(import.meta.url));` —
  // ignoring any such declaration that itself lives inside a template-literal body (generated code).
  const siblingDirIdents = new Set<string>();
  const identRe = /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*dirname\(fileURLToPath\(import\.meta\.url\)\)/g;
  let identMatch: RegExpExecArray | null;
  while ((identMatch = identRe.exec(src))) {
    if (!insideAny(litRanges, identMatch.index)) siblingDirIdents.add(identMatch[1]!);
  }

  const calls = findJoinCalls(src, (ident) => siblingDirIdents.has(ident), litRanges);
  for (const literalSegments of calls) {
    if (literalSegments.length === 0) continue;
    const resolved = join(DIST, ...literalSegments);
    if (!existsSync(resolved)) {
      violations.push(`${file}: sibling read of '${join(...literalSegments)}' -> expected ${resolved} to exist, but it does not`);
    }
  }
}

if (violations.length) {
  console.error(
    `build-cli: static scan found ${violations.length} sibling-read literal(s) that won't resolve in the published bundle (add the source to DATA_FILES above):\n` +
      violations.map((v) => `  ${v}`).join('\n'),
  );
  process.exit(1);
}

// Force a Node shebang (the bun entry's shebang is carried through otherwise).
let cli = readFileSync(`${DIST}/cli.js`, 'utf8');
cli = cli.replace(/^#![^\n]*\n/, '');
writeFileSync(`${DIST}/cli.js`, `#!/usr/bin/env node\n${cli}`);
chmodSync(`${DIST}/cli.js`, 0o755);

console.log(`built ${DIST}/cli.js (node) + ${DATA_FILES.length} runtime data files (scan: ${violations.length === 0 ? 'clean' : 'FAILED'})`);
