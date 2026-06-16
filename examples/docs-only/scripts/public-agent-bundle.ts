import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';

export type AgentStatus = 'pr-ready' | 'blocked' | 'failed';

export interface AgentBundleManifest {
  schema_version: 1;
  run_id: string;
  repo: string;
  issue: number;
  actor: string;
  status: AgentStatus;
  created_at: string;
  session: string;
  run_receipt?: string;
  transcript?: string;
  patch: string;
  decisions?: string[];
  artifacts: string[];
  evidence: EvidenceItem[];
}

export interface EvidenceItem {
  path: string;
  kind: 'screenshot' | 'cli-screenshot' | 'log' | 'artifact';
  media_type: string;
}

export interface ArtifactLimits {
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
  allowedExtensions: string[];
}

export interface PatchPolicy {
  allowedPaths: string[];
}

export const DEFAULT_ARTIFACT_LIMITS: ArtifactLimits = {
  maxFiles: 50,
  maxFileBytes: 2 * 1024 * 1024,
  maxTotalBytes: 10 * 1024 * 1024,
  allowedExtensions: ['.json', '.log', '.md', '.txt', '.webp', '.png', '.jpg', '.jpeg'],
};

export const DEFAULT_PATCH_POLICY: PatchPolicy = {
  allowedPaths: ['**'],
};

export function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error(`symlink is not allowed in artifact tree: ${path}`);
    if (stat.isDirectory()) out.push(...listFiles(path));
    else out.push(path);
  }
  return out;
}

export function copyTree(src: string, dst: string): string[] {
  if (!existsSync(src)) return [];
  const copied: string[] = [];
  for (const file of listFiles(src)) {
    const rel = relative(src, file);
    const target = join(dst, rel);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(file, target);
    copied.push(rel);
  }
  return copied.sort();
}

export function assertNoRealLookingSecrets(files: string[]): void {
  const patterns = [
    /sk_live_[A-Za-z0-9]{12,}/,
    /rk_live_[A-Za-z0-9]{12,}/,
    /xox(?:b|p|a|r)-[A-Za-z0-9-]{20,}/,
    /ghp_[A-Za-z0-9]{30,}/,
    /github_pat_[A-Za-z0-9_]{30,}/,
    /anthropic_[A-Za-z0-9_-]{20,}/,
    /OPENAI_API_KEY\s*=\s*sk-[A-Za-z0-9_-]{20,}/,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  ];

  for (const file of files) {
    const buffer = readFileSync(file);
    if (buffer.includes(0)) continue;
    const text = buffer.toString('utf8');
    for (const pattern of patterns) {
      if (pattern.test(text)) throw new Error(`real-looking secret found in ${file}: ${pattern}`);
    }
  }
}

export function assertBundleArtifactsSafe(bundleDir: string, manifest: AgentBundleManifest, limits = DEFAULT_ARTIFACT_LIMITS): void {
  const uniqueArtifacts = [...new Set(manifest.artifacts)];
  if (uniqueArtifacts.length > limits.maxFiles) {
    throw new Error(`too many artifact files: ${uniqueArtifacts.length} > ${limits.maxFiles}`);
  }

  let totalBytes = 0;
  for (const rel of uniqueArtifacts) {
    const ext = extensionOf(rel);
    if (!limits.allowedExtensions.includes(ext)) throw new Error(`artifact extension not allowed: ${rel}`);

    const path = join(bundleDir, rel);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) throw new Error(`artifact symlink is not allowed: ${rel}`);
    if (!stat.isFile()) throw new Error(`artifact is not a regular file: ${rel}`);
    if (stat.size > limits.maxFileBytes) throw new Error(`artifact file too large: ${rel}`);
    totalBytes += stat.size;
    if (totalBytes > limits.maxTotalBytes) throw new Error(`artifact bundle too large: ${totalBytes} > ${limits.maxTotalBytes}`);

    const buffer = readFileSync(path);
    if (!isAllowedBinaryArtifact(rel) && buffer.includes(0)) {
      throw new Error(`artifact contains binary data: ${rel}`);
    }
  }
}

export function detectEvidence(artifactPaths: string[]): EvidenceItem[] {
  return artifactPaths.map((path) => {
    const lower = path.toLowerCase();
    if (lower.endsWith('.webp')) return { path, kind: screenshotKind(path), media_type: 'image/webp' };
    if (lower.endsWith('.png')) return { path, kind: screenshotKind(path), media_type: 'image/png' };
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return { path, kind: screenshotKind(path), media_type: 'image/jpeg' };
    if (lower.endsWith('.log') || lower.endsWith('.txt')) return { path, kind: 'log', media_type: 'text/plain' };
    if (lower.endsWith('.md')) return { path, kind: 'artifact', media_type: 'text/markdown' };
    if (lower.endsWith('.json')) return { path, kind: 'artifact', media_type: 'application/json' };
    return { path, kind: 'artifact', media_type: 'application/octet-stream' };
  });
}

export function promoteWebpEvidence(bundleDir: string, artifactPaths: string[]): string[] {
  const promoted = [...artifactPaths];
  for (const rel of artifactPaths) {
    const lower = rel.toLowerCase();
    if (!lower.endsWith('.png') && !lower.endsWith('.jpg') && !lower.endsWith('.jpeg')) continue;
    const source = join(bundleDir, rel);
    const targetRel = rel.replace(/\.(png|jpg|jpeg)$/i, '.webp');
    const target = join(bundleDir, targetRel);
    const result = spawnSync('cwebp', ['-quiet', source, '-o', target], { encoding: 'utf8' });
    if ((result.status ?? 1) !== 0) {
      throw new Error(`cwebp failed for ${rel}: ${result.stderr || result.stdout || 'install webp/cwebp'}`);
    }
    promoted.push(targetRel);
  }
  return [...new Set(promoted)].sort();
}

function screenshotKind(path: string): EvidenceItem['kind'] {
  return path.toLowerCase().includes('cli') || path.toLowerCase().includes('terminal') ? 'cli-screenshot' : 'screenshot';
}

export function validateManifest(value: unknown): AgentBundleManifest {
  if (!value || typeof value !== 'object') throw new Error('manifest must be an object');
  const manifest = value as Partial<AgentBundleManifest>;
  if (manifest.schema_version !== 1) throw new Error('unsupported bundle schema_version');
  if (!manifest.run_id || typeof manifest.run_id !== 'string') throw new Error('manifest.run_id is required');
  if (!manifest.repo || typeof manifest.repo !== 'string') throw new Error('manifest.repo is required');
  if (!Number.isInteger(manifest.issue) || Number(manifest.issue) <= 0) throw new Error('manifest.issue is invalid');
  if (!manifest.actor || typeof manifest.actor !== 'string') throw new Error('manifest.actor is required');
  if (manifest.status !== 'pr-ready' && manifest.status !== 'blocked' && manifest.status !== 'failed') throw new Error('manifest.status is invalid');
  if (!manifest.session || typeof manifest.session !== 'string') throw new Error('manifest.session is required');
  if (manifest.run_receipt !== undefined && typeof manifest.run_receipt !== 'string') throw new Error('manifest.run_receipt is invalid');
  if (manifest.transcript !== undefined && typeof manifest.transcript !== 'string') throw new Error('manifest.transcript is invalid');
  if (!manifest.patch || typeof manifest.patch !== 'string') throw new Error('manifest.patch is required');
  if (manifest.decisions !== undefined && (!Array.isArray(manifest.decisions) || manifest.decisions.some((p) => typeof p !== 'string'))) {
    throw new Error('manifest.decisions is invalid');
  }
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.some((p) => typeof p !== 'string')) throw new Error('manifest.artifacts is invalid');
  if (!Array.isArray(manifest.evidence)) throw new Error('manifest.evidence is invalid');
  return manifest as AgentBundleManifest;
}

export function assertBundlePathsSafe(bundleDir: string, manifest: AgentBundleManifest): void {
  for (const rel of [
    manifest.session,
    manifest.run_receipt,
    manifest.transcript,
    manifest.patch,
    ...(manifest.decisions ?? []),
    ...manifest.artifacts,
    ...manifest.evidence.map((e) => e.path),
  ].filter((item): item is string => Boolean(item))) {
    if (rel.startsWith('/') || rel.includes('..')) throw new Error(`unsafe bundle path: ${rel}`);
    const abs = resolve(bundleDir, rel);
    if (!abs.startsWith(resolve(bundleDir) + '/') && abs !== resolve(bundleDir)) throw new Error(`bundle path escapes bundle: ${rel}`);
  }
}

export function assertEvidenceManifestSafe(bundleDir: string, manifest: AgentBundleManifest): void {
  const artifactSet = new Set(manifest.artifacts);
  const allowedKinds = new Set(['screenshot', 'cli-screenshot', 'log', 'artifact']);
  const seen = new Set<string>();
  for (const item of manifest.evidence) {
    if (!item || typeof item !== 'object') throw new Error('manifest.evidence item is invalid');
    if (typeof item.path !== 'string' || !artifactSet.has(item.path)) throw new Error(`evidence path is not a listed artifact: ${item.path}`);
    if (seen.has(item.path)) throw new Error(`duplicate evidence path: ${item.path}`);
    seen.add(item.path);
    if (!allowedKinds.has(item.kind)) throw new Error(`evidence kind is invalid: ${item.path}`);
    if (typeof item.media_type !== 'string' || !item.media_type.includes('/')) throw new Error(`evidence media_type is invalid: ${item.path}`);
    const abs = resolve(bundleDir, item.path);
    if (!existsSync(abs)) throw new Error(`evidence file is missing: ${item.path}`);
  }
}

export function patchTouchedPaths(patchText: string): string[] {
  const paths = new Set<string>();
  for (const line of patchText.split('\n')) {
    const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (match) {
      paths.add(match[1]);
      paths.add(match[2]);
    }
  }
  return [...paths].sort();
}

export function assertPatchSafe(patchText: string, policy = DEFAULT_PATCH_POLICY): void {
  assertPatchTextSafe(patchText);
  for (const path of patchTouchedPaths(patchText)) {
    if (path.startsWith('/') || path.includes('..')) throw new Error(`unsafe patch path: ${path}`);
    if (path === '.gitmodules') throw new Error('agent patch may not edit .gitmodules');
    if (path.startsWith('.github/workflows/')) throw new Error('agent patch may not edit GitHub workflows');
    if (path.startsWith('.git/')) throw new Error('agent patch may not edit .git');
    if (!matchesAnyAllowedPath(path, policy.allowedPaths)) throw new Error(`agent patch path is not allowed by policy: ${path}`);
  }
  assertNoRealLookingSecretsFromText(patchText);
}

function assertPatchTextSafe(patchText: string): void {
  const forbidden = [
    { pattern: /^GIT binary patch$/m, reason: 'binary patches are not allowed' },
    { pattern: /^new file mode 120000$/m, reason: 'symlinks are not allowed' },
    { pattern: /^old mode /m, reason: 'mode changes are not allowed' },
    { pattern: /^new mode /m, reason: 'mode changes are not allowed' },
    { pattern: /^deleted file mode /m, reason: 'file deletions are not allowed' },
  ];
  for (const item of forbidden) {
    if (item.pattern.test(patchText)) throw new Error(item.reason);
  }
}

function matchesAnyAllowedPath(path: string, patterns: string[]): boolean {
  return patterns.some((pattern) => globMatch(path, pattern));
}

function globMatch(path: string, pattern: string): boolean {
  if (pattern === path || pattern === '**') return true;
  let source = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const next = pattern[index + 1];
    if (char === '*' && next === '*') {
      if (pattern[index + 2] === '/') {
        source += '(?:.*/)?';
        index += 2;
      } else {
        source += '.*';
        index += 1;
      }
    } else if (char === '*') {
      source += '[^/]*';
    } else {
      source += escapeRegex(char);
    }
  }
  return new RegExp(`${source}$`).test(path);
}

function escapeRegex(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

function extensionOf(path: string): string {
  const match = path.toLowerCase().match(/(\.[^.\/]+)$/);
  return match?.[1] ?? '';
}

function isAllowedBinaryArtifact(path: string): boolean {
  return ['.webp', '.png', '.jpg', '.jpeg'].includes(extensionOf(path));
}

export function assertNoRealLookingSecretsFromText(text: string): void {
  const patterns = [
    /sk_live_[A-Za-z0-9]{12,}/,
    /rk_live_[A-Za-z0-9]{12,}/,
    /xox(?:b|p|a|r)-[A-Za-z0-9-]{20,}/,
    /ghp_[A-Za-z0-9]{30,}/,
    /github_pat_[A-Za-z0-9_]{30,}/,
    /anthropic_[A-Za-z0-9_-]{20,}/,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  ];
  for (const pattern of patterns) {
    if (pattern.test(text)) throw new Error(`real-looking secret found in patch: ${pattern}`);
  }
}

export function git(repo: string, args: string[], allowFailure = false): string {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8' });
  if ((result.status ?? 1) !== 0 && !allowFailure) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function defaultRunId(issue: number): string {
  return `run_issue_${issue}_${Date.now()}`;
}

export function safeName(value: string): string {
  return basename(value).replace(/[^A-Za-z0-9._-]/g, '-');
}
