// The accepted local control generation. Candidate worktrees are application data; the checkout whose
// default-branch commit passed review is the authority that schedules, publishes, and launches review.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultProc } from './proc.ts';
import type { ProcRunner } from './types.ts';
import { readActivationRoutingState } from './activation-paths.ts';

export interface ControlGeneration {
  schema: 'open-autonomy.control-generation.v1';
  sha: string;
  codeHost: string;
  defaultBranch?: string;
  acceptedAt: string;
}

const SHA = /^[0-9a-f]{40}$/;

export function controlGenerationPath(cwd: string): string {
  return join(cwd, '.open-autonomy', 'runner-state', 'control-generation.json');
}

function git(proc: ProcRunner, cwd: string, args: string[]): string {
  const result = proc('git', args, { cwd, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
}

function codeHost(cwd: string): string {
  try {
    const manifest = JSON.parse(readFileSync(join(cwd, '.open-autonomy', 'autonomy.json'), 'utf8')) as { codeHost?: unknown };
    return typeof manifest.codeHost === 'string' ? manifest.codeHost : '';
  } catch {
    return '';
  }
}

function remoteDefaultBranch(proc: ProcRunner, cwd: string): string {
  const local = git(proc, cwd, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
  if (local.startsWith('origin/')) return local.slice('origin/'.length);
  const remote = git(proc, cwd, ['ls-remote', '--symref', 'origin', 'HEAD']);
  const match = /^ref: refs\/heads\/([^\t]+)\tHEAD$/m.exec(remote);
  return match?.[1] ?? '';
}

function remoteSha(proc: ProcRunner, cwd: string, branch: string): string {
  const line = git(proc, cwd, ['ls-remote', 'origin', `refs/heads/${branch}`]);
  return line.split(/\s+/)[0] ?? '';
}

function writeGeneration(cwd: string, generation: ControlGeneration): void {
  const path = controlGenerationPath(cwd);
  mkdirSync(join(cwd, '.open-autonomy', 'runner-state'), { recursive: true });
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(generation, null, 2)}\n`);
  renameSync(temporary, path);
}

function retainedByAtomicActivation(cwd: string, sha: string, proc: ProcRunner): boolean {
  const state = readActivationRoutingState(cwd, proc);
  return !!state && [state.active, state.previous, ...state.draining].some((generation) => generation?.sha === sha);
}

export function readControlGeneration(cwd: string): ControlGeneration | null {
  try {
    const value = JSON.parse(readFileSync(controlGenerationPath(cwd), 'utf8')) as ControlGeneration;
    if (value.schema !== 'open-autonomy.control-generation.v1' || !SHA.test(value.sha)) return null;
    return value;
  } catch {
    return null;
  }
}

/** Resolve and persist the one control SHA this scheduler invocation is allowed to use. GitHub-backed
 * installs fail closed unless local HEAD is exactly the remote default-branch head. */
export function acceptControlGeneration(cwd: string, proc: ProcRunner = defaultProc): ControlGeneration | null {
  const host = codeHost(cwd);
  if (host !== 'github' && host !== 'local-git') return null;
  const sha = git(proc, cwd, ['rev-parse', 'HEAD']).toLowerCase();
  if (!SHA.test(sha)) throw new Error('[oa] control generation: cannot resolve the control checkout HEAD');
  let defaultBranch: string | undefined;
  if (host === 'github') {
    defaultBranch = remoteDefaultBranch(proc, cwd);
    if (!defaultBranch) {
      throw new Error('[oa] control generation: cannot resolve origin\'s default branch; run `git remote set-head origin --auto`, then retry');
    }
    const accepted = remoteSha(proc, cwd, defaultBranch).toLowerCase();
    if (!SHA.test(accepted)) {
      throw new Error(`[oa] control generation: cannot resolve origin/${defaultBranch}; network/auth may be unavailable — refusing to dispatch`);
    }
    if (accepted !== sha) {
      throw new Error(
        `[oa] control generation drift: checkout HEAD ${sha.slice(0, 12)} is not accepted origin/${defaultBranch} ${accepted.slice(0, 12)}. ` +
          'Stop the scheduler, update the control checkout to the accepted default branch, and restart.',
      );
    }
  }
  const generation: ControlGeneration = {
    schema: 'open-autonomy.control-generation.v1',
    sha,
    codeHost: host,
    ...(defaultBranch ? { defaultBranch } : {}),
    acceptedAt: new Date().toISOString(),
  };
  writeGeneration(cwd, generation);
  return generation;
}

/** Re-check a durable marker before exercising authority. A scheduler started at one SHA cannot keep
 * publishing after its control checkout or the accepted remote default branch changes underneath it. */
export function verifyControlGeneration(
  cwd: string,
  expectedSha: string,
  proc: ProcRunner = defaultProc,
): ControlGeneration {
  const recorded = readControlGeneration(cwd);
  if (!recorded) {
    throw new Error('[oa] control generation is missing or invalid; restart with `oa start` before recovering effects');
  }
  if (recorded.sha !== expectedSha) {
    throw new Error(`[oa] stale control generation: effect expects ${expectedSha.slice(0, 12)}, active generation is ${recorded.sha.slice(0, 12)}`);
  }
  const head = git(proc, cwd, ['rev-parse', 'HEAD']).toLowerCase();
  if (head !== expectedSha) {
    throw new Error(`[oa] control checkout changed: effect expects ${expectedSha.slice(0, 12)}, HEAD is ${head.slice(0, 12) || '(unresolved)'}`);
  }
  if (recorded.codeHost === 'github') {
    const branch = recorded.defaultBranch;
    const accepted = branch ? remoteSha(proc, cwd, branch).toLowerCase() : '';
    if ((!branch || accepted !== expectedSha) && !retainedByAtomicActivation(cwd, expectedSha, proc)) {
      throw new Error(
        `[oa] accepted remote generation changed: expected ${expectedSha.slice(0, 12)} at origin/${branch ?? '(unknown)'}. ` +
          'Stop, update the control checkout, and restart; the pending effect was retained.',
      );
    }
  }
  return recorded;
}

/** Prove authority-bearing bytes still come from the recorded commit, not an uncommitted mutation of the
 * control checkout. Candidate data may be dirty; these control paths may not. */
export function verifyControlPaths(
  cwd: string,
  expectedSha: string,
  paths: string[],
  proc: ProcRunner = defaultProc,
): void {
  const unique = [...new Set(paths.filter(Boolean))];
  if (!unique.length) return;
  const result = proc('git', ['diff', '--quiet', expectedSha, '--', ...unique], { cwd, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(
      `[oa] control generation bytes changed outside review: ${unique.join(', ')}. ` +
        'Restore the accepted files or land the change, then restart; pending effects were retained.',
    );
  }
}
