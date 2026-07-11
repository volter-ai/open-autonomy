#!/usr/bin/env bun
// TS.2 drift guard — "no scaffold code branches on a literal profile name"
// (OA-INSTALL-IMPLEMENTATION-TASKS.md TS.2; DESIGN §Q0 Layer 1: "scaffold code paths key off pack fields,
// not `if (profile === 'self-driving')`"). TS.1's SetupPack is the seam: every common-scaffold consumer
// (the recommender, `oa maturity`, the install-phase CLIs) is supposed to read a pack FIELD, never compare
// an in-hand profile identifier against one of the four profile directory names to decide behavior. TS.2's
// job is to make that invariant self-enforcing rather than something a reviewer has to remember to check.
//
// METHOD — real AST parsing (TypeScript's own compiler API), not a regex guess. `typescript` is already a
// devDependency (tsc runs `check:autonomy`); this script uses it programmatically. Bun's ESM interop with
// the `typescript` CJS package drops everything but {default,version} on a namespace import (confirmed by
// hand during this unit's build), so we go through `createRequire` instead — the same package, loaded the
// way tsc's own CLI wrapper effectively does, exercised inside this repo so resolution finds the local
// `node_modules/typescript`, not some unrelated global cache copy.
//
// THE ANTI-PATTERN, PRECISELY: a string literal whose text is EXACTLY one of the four real profile
// directory names appears as a direct operand of an equality-comparison operator (`===`/`!==`/`==`/`!=`),
// or as a `case` expression in a `switch`. That is the actual token the task's if/switch/ternary/&&/||
// enumeration bottoms out on — an `if`, a ternary, or a `&&`/`||` compound condition can each *wrap* an
// equality comparison, but the comparison itself is the thing that encodes "branch on this profile's
// identity", and it is wrapper-position-agnostic: `if (p === 'self-driving')`, `p === 'self-driving' ? a :
// b`, `x && p === 'self-driving'`, and `(p === 'self-driving') || y` are ALL caught by the same one rule
// (the literal is an operand of an equality operator), because in every case the comparison node itself is
// visited regardless of what ancestor statement contains it. `switch (p) { case 'self-driving': }` is
// caught by a second, narrower rule (case-clause expression) since a switch discriminant match has no
// equality *operator* node to hang the first rule off of.
//
// WHAT IS *NOT* FLAGGED (BY DESIGN, per the task's own carve-outs):
//   - a profile-name literal used as a DATA VALUE: a function-call argument (`eligible(byName, facts,
//     'self-driving', 'gh-actions')`), a returned/constructed object's property value (`{ profile:
//     'self-driving' }`), a CLI default/fixture path, or a documentation string. None of these decide
//     control flow by comparing against the literal — they just carry it as data (often the recommender's
//     own OUTPUT, whose entire job is to name a profile).
//   - a profiles/${x}-shaped PATH CONSTRUCTION — parameterized, so no exact-name literal ever appears.
//   - anything inside a comment — comments are trivia, never part of the AST this script walks, so a
//     literal `if (profile === 'self-driving')` inside a `//` explaining the anti-pattern (as this repo's
//     own signal-sets.ts and recommend.ts headers do) can never trip this checker.
//   - a `*.test.ts` file, or a `.d.ts` ambient-types file (no runtime logic) — excluded from the scanned
//     file set entirely (see `listScaffoldFiles`), not content-exempted.
//
// HONESTY — KNOWN FALSE NEGATIVES (documented, not silently accepted):
//   - a profile-name literal used as an OBJECT-LITERAL KEY that is later looked up dynamically (a "branch
//     table" instead of an if/switch) is behaviorally equivalent to the anti-pattern but is not a
//     conditional per the task's literal definition, so it is NOT caught. None exist in the current
//     designated corpus (verified by hand during this unit's build).
//   - `[...].includes(profile)` / `Set.has(profile)` membership checks pass the literal as a call argument,
//     not an equality operand, so they are NOT caught even though they can encode the same branch. None
//     exist in the current designated corpus (verified by hand).
//   - a degenerate `switch (someProfileVar)` whose discriminant (not a `case`) is itself the literal is not
//     specially handled (nonsensical in practice — a switch discriminant is never itself a profile-name
//     string constant in real code).
// HONESTY — KNOWN FALSE POSITIVES: the checker cannot tell "this comparison decides behavior by profile
// identity" from "this string happens to literally equal one of four specific dash-joined tokens for an
// unrelated reason" (e.g. a URL slug or label text compared for an unrelated purpose). Given the four names
// are specific multi-word tokens, not generic words, this is a theoretical risk with a demonstrated-zero
// rate on the current corpus (the clean-scan proof below), not a precision guarantee for all future code —
// a genuine future false positive should be triaged by a human, not auto-suppressed.
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type * as TSNamespace from 'typescript';

const require = createRequire(import.meta.url);
const ts = require('typescript') as typeof TSNamespace;

// The 4 real profile directory names (`profiles/<name>`) DESIGN §Q1 ships today. `hello`/`hello-human`/
// `soc2-baseline` are demo/override profiles, not part of the four-profile ladder table TS.2 governs, and
// are correctly excluded per the task's own "the 4 real profile names" scope.
export const PROFILE_NAMES = ['self-driving', 'simple-gh-sdlc', 'simple-gh', 'simple-sdlc'] as const;
export type ProfileName = (typeof PROFILE_NAMES)[number];

// Known aliases: none found. Checked (during this unit's build) for camelCase/snake_case/underscore
// variants (selfDriving, SELF_DRIVING, simpleGh, simpleSdlc, sd-hosted, …) across the entire designated
// corpus — zero hits. If a future profile ships an alias/short-name, add it here.
export const KNOWN_ALIASES: readonly string[] = [];

const ALL_LITERALS = new Set<string>([...PROFILE_NAMES, ...KNOWN_ALIASES]);

export interface Violation {
  file: string;
  line: number; // 1-based
  column: number; // 1-based
  literal: string;
  snippet: string;
  rule: 'equality-comparison' | 'switch-case';
}

const EQUALITY_OPERATORS: ReadonlySet<number> = new Set<number>([
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
]);

function profileLiteralText(node: TSNamespace.Node): string | undefined {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return ALL_LITERALS.has(node.text) ? node.text : undefined;
  }
  return undefined;
}

/** Parse `sourceText` (already read from `filePath`) and return every anti-pattern hit, AST-precise. */
export function scanSource(filePath: string, sourceText: string): Violation[] {
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const violations: Violation[] = [];
  const lines = sourceText.split('\n');

  function report(node: TSNamespace.Node, literal: string, rule: Violation['rule']) {
    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    violations.push({
      file: filePath,
      line: line + 1,
      column: character + 1,
      literal,
      snippet: (lines[line] ?? '').trim(),
      rule,
    });
  }

  function visit(node: TSNamespace.Node): void {
    // Rule 1 — equality comparison: the literal is a direct operand of ===/!==/==/!=. This is the one
    // node shape `if (p === X)`, `p === X ? a : b`, `y && p === X`, and `(p === X) || z` all reduce to.
    if (ts.isBinaryExpression(node) && EQUALITY_OPERATORS.has(node.operatorToken.kind)) {
      const left = profileLiteralText(node.left);
      const right = profileLiteralText(node.right);
      if (left) report(node, left, 'equality-comparison');
      if (right) report(node, right, 'equality-comparison');
    }
    // Rule 2 — switch/case: the literal is a `case` expression matched against the switch discriminant.
    if (ts.isCaseClause(node)) {
      const lit = profileLiteralText(node.expression);
      if (lit) report(node, lit, 'switch-case');
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return violations;
}

// --- the designated scaffold file set (TS.2's scope, enumerated live off disk — never hand-maintained) ---
// packages/core/src/{setup-pack,recommend}.ts · packages/local-runner-cli/src/*.ts (non-recursive,
// excluding *.test.ts and ambient .d.ts) · bin/install-*.ts (excluding *.test.ts) · bin/recommend-profile.ts
// · bin/ensure-ci-workflow.ts · bin/check-setup-pack.ts.
export function listScaffoldFiles(root = '.'): string[] {
  const files: string[] = [];
  const addIfExists = (p: string) => {
    if (existsSync(p) && statSync(p).isFile()) files.push(p);
  };

  addIfExists(join(root, 'packages/core/src/setup-pack.ts'));
  addIfExists(join(root, 'packages/core/src/recommend.ts'));

  const lrcDir = join(root, 'packages/local-runner-cli/src');
  if (existsSync(lrcDir)) {
    for (const entry of readdirSync(lrcDir)) {
      const p = join(lrcDir, entry);
      if (!statSync(p).isFile()) continue;
      if (!entry.endsWith('.ts')) continue;
      if (entry.endsWith('.test.ts') || entry.endsWith('.d.ts')) continue;
      files.push(p);
    }
  }

  const binDir = join(root, 'bin');
  if (existsSync(binDir)) {
    for (const entry of readdirSync(binDir)) {
      if (!entry.startsWith('install-')) continue;
      if (!entry.endsWith('.ts') || entry.endsWith('.test.ts')) continue;
      files.push(join(binDir, entry));
    }
  }
  addIfExists(join(root, 'bin/recommend-profile.ts'));
  addIfExists(join(root, 'bin/ensure-ci-workflow.ts'));
  addIfExists(join(root, 'bin/check-setup-pack.ts'));

  return files.sort();
}

export function scanFiles(root = '.'): { files: string[]; violations: Violation[] } {
  const files = listScaffoldFiles(root);
  const violations: Violation[] = [];
  for (const f of files) {
    const rel = f.startsWith(`${root}/`) ? f.slice(root.length + 1) : f;
    violations.push(...scanSource(rel, readFileSync(f, 'utf8')));
  }
  return { files, violations };
}

if (import.meta.main) {
  const { files, violations } = scanFiles('.');

  // Honest note: bin/install-select.ts (TE.2, PR #157) is part of the task's designated set but is not yet
  // merged to main at the time this check runs — future scope, not a gap in this check.
  const notes: string[] = [];
  if (!existsSync('bin/install-select.ts')) {
    notes.push('note: bin/install-select.ts not present on main yet (TE.2 / PR #157 unmerged) — future scope, not scanned.');
  }

  process.stdout.write(`no-profile-branching: scanned ${files.length} file(s):\n`);
  for (const f of files) process.stdout.write(`  ${f}\n`);
  for (const n of notes) process.stdout.write(`${n}\n`);

  if (violations.length) {
    process.stderr.write(
      `\nno-profile-branching FAIL — ${violations.length} scaffold-code branch(es) on a literal profile name ` +
        `(DESIGN §Q0 Layer 1: consumers must read a SetupPack field, not compare a profile identifier to a name):\n`,
    );
    for (const v of violations) {
      process.stderr.write(`  ${v.file}:${v.line}:${v.column} [${v.rule}] literal '${v.literal}' — ${v.snippet}\n`);
    }
    process.exit(1);
  }
  process.stdout.write(`\nno-profile-branching OK: zero literal profile-name branches across ${files.length} scanned file(s)\n`);
}
