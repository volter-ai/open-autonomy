// Write a CompileOutput to disk: generated files verbatim, copied files via a source resolver.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isScript } from './ir';
import type { AutonomyIR, CompileOutput } from './ir';
import { isInstallOwned } from './upgrade';

// A per-path merge policy for a collision the fresh-compile clobber guard would otherwise refuse (or the
// upgrade path would otherwise silently overwrite) — e.g. `.claude/settings.json`, where an adopter's
// existing file should be STRUCTURALLY merged with the generated one, not replaced (OA-10). `merge`
// receives the bytes already on disk and the bytes this compile would generate for the SAME path, and
// returns the merged bytes plus a short human note for the printed receipt (e.g. "+1 Stop hook") — or
// `undefined` when the existing file can't be merged this way (e.g. invalid JSON), in which case every
// caller here treats the path exactly as if no strategy applied at all (an ordinary clobber / a plain
// overwrite). Keyed by installed path and supplied by the CLI (bin/autonomy-compile.ts,
// bin/autonomy-upgrade.ts) — core knows no path names or file schemas, it only ever calls `merge`.
export interface MergeResult {
  content: string;
  note: string;
}
export interface MergeStrategy {
  merge(existing: string, generated: string): MergeResult | undefined;
}
export type MergeStrategies = Record<string, MergeStrategy>;

export function materialize(
  out: CompileOutput,
  destDir: string,
  readSource: (from: string) => string,
  mergeStrategies: MergeStrategies = {},
): string[] {
  const written: string[] = [];
  const write = (rel: string, content: string) => {
    const abs = join(destDir, rel);
    let finalContent = content;
    const strategy = mergeStrategies[rel];
    if (strategy && existsSync(abs)) {
      const existing = readFileSync(abs, 'utf8');
      if (existing !== content) {
        const merged = strategy.merge(existing, content);
        if (merged) finalContent = merged.content; // unmergeable (e.g. invalid JSON) -> falls through to a plain overwrite
      }
    }
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, finalContent);
    written.push(rel);
  };
  for (const [path, content] of Object.entries(out.generated)) write(path, content);
  for (const { from, to } of out.copies) write(to, readSource(from));
  return written.sort();
}

/** Paths findClobbers/materialize will actually MERGE (not overwrite) for this compile — the printed
 *  receipt's "merged: <path> (<note>)" line. Computed the SAME way materialize will actually resolve each
 *  path, so the report can never disagree with what gets written. Must be called BEFORE materialize (it
 *  reads the pre-write "existing" bytes off disk). */
export function findMerges(
  out: CompileOutput,
  destDir: string,
  readSource: (from: string) => string,
  mergeStrategies: MergeStrategies,
): Array<{ path: string; note: string }> {
  const merges: Array<{ path: string; note: string }> = [];
  const check = (rel: string, content: string) => {
    const strategy = mergeStrategies[rel];
    if (!strategy) return;
    const abs = join(destDir, rel);
    if (!existsSync(abs)) return; // nothing to merge into — a plain fresh write
    const existing = readFileSync(abs, 'utf8');
    if (existing === content) return; // already byte-identical — no merge needed
    const merged = strategy.merge(existing, content);
    if (merged) merges.push({ path: rel, note: merged.note });
  };
  for (const [path, content] of Object.entries(out.generated)) check(path, content);
  for (const { from, to } of out.copies) check(to, readSource(from));
  return merges.sort((a, b) => a.path.localeCompare(b.path));
}

/** Every `from` a compile's `copies` will read (skill dirs + resources), sorted + de-duplicated — the
 *  full set of profile-relative source paths a materialize needs to exist. Shared by both the dry-run
 *  path (print-only) and the real write, so neither can see a source set the other doesn't. */
export function copySources(out: CompileOutput): string[] {
  return [...new Set(out.copies.map((c) => c.from))].sort();
}

/** Pre-materialize validation: which of a compile's copy sources are missing on disk, given the
 *  profile's own existence check. Empty ⇒ safe to materialize. Run this BEFORE writing anything (and
 *  before a --dry-run report), so a missing skill/resource fails loudly up front instead of partway
 *  through a write (the old failure: ENOENT after N files were already on disk, --dry-run silent because
 *  it never touched the filesystem at all). Substrate-agnostic — both substrates share it via core. */
export function missingCopySources(out: CompileOutput, exists: (from: string) => boolean): string[] {
  return copySources(out).filter((from) => !exists(from));
}

/** `missingCopySources` bound to a profile directory on the real filesystem — the shape both the CLI and
 *  check-profiles want. */
export function missingCopySourcesIn(out: CompileOutput, profileDir: string): string[] {
  return missingCopySources(out, (from) => existsSync(join(profileDir, from)));
}

/** Paths a materialize into `destDir` would OVERWRITE with DIFFERENT bytes than what's already there —
 *  the fresh-compile clobber guard (BL-14). NOT scoped to scaffold profiles only: an ADDITIVE profile
 *  (simple-sdlc, simple-gh-sdlc) carries `.claude/settings.json` — the single most likely path to
 *  pre-exist in a Claude-using repo — and any same-named file under scripts/, standards/, scheduler/,
 *  .claude/skills/ also trips it; only a whole-repo SCAFFOLD (self-driving) additionally carries
 *  README.md/package.json/.gitignore, which is why those used to silently overwrite an adopter's own copies
 *  (the adopter's first hosted command). Comparing BYTES (not just existence) means an idempotent
 *  re-compile of an already-current install is never flagged; this belongs to the fresh-compile CLI, never
 *  the upgrade path (which legitimately overwrites derived files in place — packages/core/src/upgrade.ts).
 *  `mergeStrategies` (OA-10): a path with a strategy that successfully merges the existing bytes is NOT a
 *  clobber at all — it's reported separately by `findMerges` and materialize writes the merged content;
 *  only an unmergeable existing file (e.g. invalid JSON) still falls through to this refusal. */
export function findClobbers(
  out: CompileOutput,
  destDir: string,
  readSource: (from: string) => string,
  mergeStrategies: MergeStrategies = {},
): string[] {
  const clobbers: string[] = [];
  const check = (rel: string, content: string) => {
    const abs = join(destDir, rel);
    if (!existsSync(abs)) return;
    const existing = readFileSync(abs, 'utf8');
    if (existing === content) return;
    const strategy = mergeStrategies[rel];
    if (strategy && strategy.merge(existing, content)) return; // mergeable — not a clobber
    clobbers.push(rel);
  };
  for (const [path, content] of Object.entries(out.generated)) check(path, content);
  for (const { from, to } of out.copies) check(to, readSource(from));
  return clobbers.sort();
}

/** Paths a materialize into `destDir` would RE-CREATE that the operator deliberately deleted (F-9's
 *  "re-compile resurrects deletions" — the deletion-resurrection guard): listed in the PRIOR install's
 *  `.open-autonomy/generated.json` (`priorManifest`, from `readGeneratedManifest`), absent on disk right
 *  now, and present in THIS compile's output. Same refusal shape as `findClobbers` (same `--force`
 *  override), beside it so upgrade can reuse it too.
 *
 *  EXEMPT: any path this install treats as install-owned/state (`isInstallOwned`, packages/core/src/
 *  upgrade.ts) — most concretely OA-07's `.open-autonomy/paused` day-one marker. An operator's
 *  `rm .open-autonomy/paused` is the intended UNPAUSE, not an accidental deletion to undo; flagging or
 *  resurrecting it would silently re-pause a loop the operator explicitly resumed. In practice
 *  `.open-autonomy/paused` never even reaches this filter (compileLocal deliberately keeps it OUT of
 *  `generated.json`, so it's never IN `priorManifest` to begin with — see substrate-local/src/emit.ts) —
 *  the `isInstallOwned` filter is belt-and-suspenders for any manifest that lists it anyway (a legacy
 *  install, a future substrate, a hand-edited manifest), and is what makes the exemption independently
 *  testable (not just an accident of what one substrate happens to produce). */
export function findResurrections(out: CompileOutput, destDir: string, priorManifest: string[]): string[] {
  const produced = new Set([...Object.keys(out.generated), ...out.copies.map((c) => c.to)]);
  return priorManifest
    .filter((path) => !isInstallOwned(path))
    .filter((path) => produced.has(path) && !existsSync(join(destDir, path)))
    .sort();
}

/** BL-22 dev/03: a skill's SKILL.md frontmatter `name` MUST equal its folder (the agent's `behavior`).
 *  Both harnesses trigger a skill by that name — codex `$name`, Claude Code `/name` (`promptFiles` in
 *  substrate-local's emit.ts sends exactly that) — and it's installed under `.{codex,claude}/skills/
 *  <behavior>/`, so a frontmatter mismatch compiles clean and then the launch prompt never resolves.
 *  Previously enforced only in-repo (bin/check-profiles.ts), so an external profile author got no signal
 *  at all. Substrate-agnostic (works from the IR + profile dir directly, before any substrate compiles
 *  it) — skips a SKILL.md that doesn't exist (missingCopySourcesIn already reports that separately). */
export function validateSkillFrontmatterIn(ir: AutonomyIR, profileDir: string): string[] {
  const errors: string[] = [];
  for (const [role, agent] of Object.entries(ir.agents ?? {})) {
    if (isScript(agent.behavior)) continue; // a script has no SKILL.md — it IS the behavior
    const skillFile = join(profileDir, 'skills', agent.behavior, 'SKILL.md');
    if (!existsSync(skillFile)) continue;
    const name = readFileSync(skillFile, 'utf8').match(/^name:\s*(.+?)\s*$/m)?.[1];
    if (name !== agent.behavior)
      errors.push(
        `agent ${role}: skill "${agent.behavior}"'s SKILL.md frontmatter name "${name ?? '(missing)'}" must equal its folder "${agent.behavior}" (the launch trigger resolves by name)`,
      );
  }
  return errors;
}
