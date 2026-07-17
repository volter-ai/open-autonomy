import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute, join, normalize, sep } from 'node:path';

function safeManagedPath(path: string): string {
  const normalized = normalize(path);
  if (!path || isAbsolute(path) || normalized === '..' || normalized.startsWith(`..${sep}`)) {
    throw new Error(`generated manifest contains an unsafe path: ${path}`);
  }
  return normalized;
}

/** Content receipt for the complete generated deployment artifact. This is deliberately independent of
 * git: an activated generation may contain machine-local materialization that is not in the portable
 * accepted commit, but any post-validation mutation must invalidate the receipt. */
export function generationValidationDigest(root: string): string {
  const manifestPath = join(root, '.open-autonomy', 'generated.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { files?: unknown };
  if (!Array.isArray(manifest.files) || !manifest.files.every((path) => typeof path === 'string')) {
    throw new Error(`invalid generated manifest at ${manifestPath}`);
  }
  const hash = createHash('sha256');
  for (const rawPath of [...manifest.files].sort()) {
    const path = safeManagedPath(rawPath);
    hash.update(path);
    hash.update('\0');
    hash.update(readFileSync(join(root, path)));
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}
