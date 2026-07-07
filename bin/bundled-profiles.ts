// Shared bundled-profiles helper (OA-11) — extracted from bin/autonomy-compile.ts so bin/open-autonomy.ts's
// --help can render the SAME derived list instead of a hand-maintained one that goes stale (F-10: 2 of 6
// profiles were missing from the old hardcoded HELP string).
//
// CRITICAL: import ONLY node:fs / node:path here — NEVER a substrate package (@open-autonomy/core,
// @open-autonomy/substrate-github, @open-autonomy/substrate-local). bin/open-autonomy.ts's verb switch
// lazy-imports substrate packages per-verb specifically so `--help` keeps working even when packaging is
// broken (OA-01); this helper is imported at HELP-construction time (unconditionally, before the verb
// switch), so any substrate import here would defeat that property for the one verb that must never break.
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// The bundled profiles ship next to this module's package root: at dist/cli.js when installed from npm
// (import.meta.url → dist/, profiles/ is its sibling), and at bin/ in the dev checkout (../profiles/). So
// `../profiles` resolves correctly in both. A bare name picks a bundled profile; an existing path wins first.
export const profilesRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'profiles');

export function bundledProfileNames(): string[] {
  try {
    return readdirSync(profilesRoot).filter((n) => existsSync(join(profilesRoot, n, 'ir.yml'))).sort();
  } catch {
    return [];
  }
}
