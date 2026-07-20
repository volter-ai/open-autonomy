// The ONE declaration of the sibling DATA files the published `dist/cli.js` bundle reads at runtime via
// import.meta.url (the runtime backends, the runner frontend, the github runtime mirror, the egress guard).
// Single source of truth, imported by BOTH:
//   - scripts/build-cli.ts — copies each into dist/ next to the bundle (and statically asserts they landed);
//   - bin/doctor-checks.ts — check 1 (self) asserts each is present + readable beside the running bundle,
//     so a forgotten data file is a doctor FAIL by construction, not a list that can silently drift from the
//     build's own manifest (the OA-18 skeptic-panel PROOF FIX 7).
// PURE MODULE — no side effects at import time (it is pulled into the CLI bundle and into build-cli.ts).
export interface BundleDataFile {
  /** repo-root-relative source path */
  src: string;
  /** path relative to dist/ (i.e. beside the bundle, which is dist/cli.js) */
  dest: string;
  /** copied recursively (a directory) rather than as a single file */
  dir?: boolean;
}

export const BUNDLE_DATA_FILES: readonly BundleDataFile[] = [
  { src: 'packages/substrate-local/src/backend.mjs', dest: 'backend.mjs' },
  { src: 'packages/substrate-local/src/managed-provider.mjs', dest: 'managed-provider.mjs' },
  { src: 'packages/substrate-local/src/runner-frontend.ts', dest: 'runner-frontend.ts' },
  { src: 'packages/substrate-github/src/control-backend.mjs', dest: 'control-backend.mjs' },
  { src: 'packages/substrate-github/src/egress-guard.sh', dest: 'egress-guard.sh' },
  { src: 'packages/substrate-github/src/runtime', dest: 'runtime', dir: true },
] as const;
