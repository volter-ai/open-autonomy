// The generated-files manifest: the install's record of exactly which paths open-autonomy produced.
//
// This is the PROVENANCE the upgrade prune needs. The old prune inferred ownership by walking generic
// dirs (scripts/, .github/workflows/) and deleting anything the current compile didn't emit — which
// silently destroys hand-authored files in those universally-user-owned directories. Instead, the
// compile now records its own output footprint here, and upgrade only ever removes files THIS manifest
// lists (and the new compile no longer produces). A file open-autonomy never generated is never in the
// manifest, so it can never be pruned — regardless of its folder name. (The Terraform/Helm/kubectl
// `--prune -l` model: manage and destroy only what you provably own.)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CompileOutput } from './ir';

export const GENERATED_MANIFEST_PATH = '.open-autonomy/generated.json';

export interface GeneratedManifest {
  schema: 'open-autonomy.generated.v1';
  files: string[];
}

/** Every path this compile produces, sorted — including the manifest file itself. */
function generatedPaths(out: CompileOutput): string[] {
  return [
    ...Object.keys(out.generated),
    ...out.copies.map((c) => c.to),
    GENERATED_MANIFEST_PATH,
  ].sort();
}

/** Return `out` with the generated-files manifest added to its generated set, so it materializes like
 *  any other generated file and travels with every installation. Substrates call this on their output. */
export function withGeneratedManifest(out: CompileOutput): CompileOutput {
  const manifest: GeneratedManifest = { schema: 'open-autonomy.generated.v1', files: generatedPaths(out) };
  return { ...out, generated: { ...out.generated, [GENERATED_MANIFEST_PATH]: `${JSON.stringify(manifest, null, 2)}\n` } };
}

/** The paths a prior install recorded as open-autonomy-generated. Empty when there is no manifest (a
 *  legacy install, or a non-installation directory) — which makes prune a no-op rather than a guess. */
export function readGeneratedManifest(targetDir: string): string[] {
  try {
    const parsed = JSON.parse(readFileSync(join(targetDir, GENERATED_MANIFEST_PATH), 'utf8')) as GeneratedManifest;
    return Array.isArray(parsed.files) ? parsed.files : [];
  } catch {
    return [];
  }
}
