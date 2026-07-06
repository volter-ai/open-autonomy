// Write a CompileOutput to disk: generated files verbatim, copied files via a source resolver.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
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
