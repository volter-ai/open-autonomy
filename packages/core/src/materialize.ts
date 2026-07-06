// Write a CompileOutput to disk: generated files verbatim, copied files via a source resolver.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { CompileOutput } from './ir';

export function materialize(out: CompileOutput, destDir: string, readSource: (from: string) => string): string[] {
  const written: string[] = [];
  const write = (rel: string, content: string) => {
    const abs = join(destDir, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
    written.push(rel);
  };
  for (const [path, content] of Object.entries(out.generated)) write(path, content);
  for (const { from, to } of out.copies) write(to, readSource(from));
  return written.sort();
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
 *  the fresh-compile clobber guard (BL-14): a scaffold-class profile (self-driving) carries
 *  README.md/package.json/.gitignore as resources, so compiling it into an adopter's existing repo used
 *  to silently overwrite them (the adopter's first hosted command). An additive profile (simple-*, hello)
 *  never collides because it carries no such files — this returns [] for them. Comparing BYTES (not just
 *  existence) means an idempotent re-compile of an already-current install is never flagged; this belongs
 *  to the fresh-compile CLI, never the upgrade path (which legitimately overwrites derived files in
 *  place — packages/core/src/upgrade.ts). */
export function findClobbers(out: CompileOutput, destDir: string, readSource: (from: string) => string): string[] {
  const clobbers: string[] = [];
  const check = (rel: string, content: string) => {
    const abs = join(destDir, rel);
    if (!existsSync(abs)) return;
    if (readFileSync(abs, 'utf8') !== content) clobbers.push(rel);
  };
  for (const [path, content] of Object.entries(out.generated)) check(path, content);
  for (const { from, to } of out.copies) check(to, readSource(from));
  return clobbers.sort();
}
