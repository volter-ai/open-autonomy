// BL-29 dev/01: resolve the ztrack preset name a compiled profile's "next steps" print should use.
// Extracted to its own module (no top-level side effects) so it's importable from a test — the CLI it
// backs (bin/autonomy-compile.ts) executes on import.
import type { AutonomyIR } from '@open-autonomy/core';

// OA-12 (F-11, version drift): the ztrack version this open-autonomy release is tested against — the
// SAME version pinned in this package's own `package.json` devDependency. Docs (docs/OPERATIONS.md) and
// the compile next-steps hint (bin/autonomy-compile.ts) both render this constant instead of leaving a
// bare `npm install -D ztrack` / `npx ztrack` to resolve whatever `latest` happens to be at install time
// (the audit: `npx` fetched `ztrack@1.0.0` into a repo pinned to `0.47.1` — two majors of skew). Kept in
// sync with `package.json`'s `ztrack` devDependency by an assertion in `bin/ztrack-preset.test.ts` — bump
// both together.
export const KNOWN_GOOD_ZTRACK = '1.3.1';

export interface ZtrackPresetResolution {
  presetName: string;
  /** Set only when the resolution fell back to the directory basename AND that basename isn't a known
   *  bundled preset — the loud-degrade case: the ztrack command this feeds will likely fail with "no such
   *  preset" unless one happens to exist under that exact name. */
  warning?: string;
}

/** `policy.box.tracker.ztrackPreset` wins if declared (survives a fork renaming the profile directory —
 *  BL-29: `bin/autonomy-compile.ts:67` used to key the preset by directory basename alone, so a rename
 *  silently selected a nonexistent preset). Falling back to the basename is fine for the bundled profiles
 *  (their basename IS their preset name today) but degrades LOUDLY — not silently — when that basename
 *  isn't one of the known bundled names, since the ztrack command it feeds would otherwise fail later with
 *  an opaque "no such preset". */
export function resolveZtrackPreset(ir: AutonomyIR, profileDirBasename: string, bundledProfileNames: string[]): ZtrackPresetResolution {
  const trackerBox = (ir.policy.box.tracker ?? {}) as { ztrackPreset?: string };
  if (trackerBox.ztrackPreset) return { presetName: trackerBox.ztrackPreset };
  const presetName = profileDirBasename;
  if (bundledProfileNames.includes(presetName)) return { presetName };
  return {
    presetName,
    warning:
      `open-autonomy: WARNING — this profile declares no policy.box.tracker.ztrackPreset; falling back to its directory name "${presetName}", which is not a bundled ztrack preset (${bundledProfileNames.join(', ') || '(none found)'}). ` +
      `The ztrack command below will likely fail with "no such preset" unless a preset literally named "${presetName}" exists. Fix: declare policy.box.tracker.ztrackPreset explicitly in this profile's ir.yml.`,
  };
}
