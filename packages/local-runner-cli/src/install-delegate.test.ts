// TE.8 — unit tests for install-delegate.ts (`oa install`'s spawn-not-import delegate to bin/install.ts).
// Never spawns a real `bun` process here: `runInstallDelegate`'s `spawn` seam is always stubbed, so this
// file never touches a real filesystem/agent side effect beyond the resolution check itself.
import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { INSTALL_NOT_AVAILABLE_MESSAGE, resolveInstallScript, runInstallDelegate } from './install-delegate.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..', '..');

describe('resolveInstallScript', () => {
  test('resolves bin/install.ts relative to this file, in the real monorepo checkout', () => {
    const resolved = resolveInstallScript();
    expect(resolved).toBeDefined();
    expect(resolved).toBe(join(REPO_ROOT, 'bin', 'install.ts'));
    expect(existsSync(resolved!)).toBe(true);
  });

  test('returns undefined when bin/install.ts is not found relative to a synthetic location (standalone-vendored case)', () => {
    // A file three levels under a directory with no bin/install.ts anywhere above it — mirrors a real
    // vendored @volter/oa install outside this monorepo.
    const synthetic = pathToFileURL(join('/tmp', 'nonexistent-oa-vendor-dir', 'src', 'bin', 'oa.ts')).href;
    expect(resolveInstallScript(synthetic)).toBeUndefined();
  });
});

describe('runInstallDelegate', () => {
  test('not available (empty scriptPath, forcing the not-available branch) -> code 1, honest message, never spawns', () => {
    let spawnCalled = false;
    const r = runInstallDelegate(['--help'], {
      scriptPath: '',
      spawn: () => {
        spawnCalled = true;
        return { status: 0, stdout: '', stderr: '' };
      },
    });
    expect(r).toEqual({ available: false, code: 1, message: INSTALL_NOT_AVAILABLE_MESSAGE });
    expect(spawnCalled).toBe(false);
    expect(r.message).toMatch(/SOURCE-CHECKOUT-ONLY/);
  });

  test('available -> spawns `bun <scriptPath> ...argv>` with inherited stdio, relays the exit code', () => {
    let seenCmd: string | undefined;
    let seenArgs: string[] | undefined;
    let seenOpts: { cwd?: string; stdio: 'inherit' } | undefined;
    const r = runInstallDelegate(['/some/repo', '--auto-approve'], {
      cwd: '/some/cwd',
      scriptPath: '/fake/bin/install.ts',
      spawn: (cmd, args, opts) => {
        seenCmd = cmd;
        seenArgs = args;
        seenOpts = opts;
        return { status: 7, stdout: '', stderr: '' };
      },
    });
    expect(seenCmd).toBe('bun');
    expect(seenArgs).toEqual(['/fake/bin/install.ts', '/some/repo', '--auto-approve']);
    expect(seenOpts).toEqual({ cwd: '/some/cwd', stdio: 'inherit' });
    expect(r).toEqual({ available: true, scriptPath: '/fake/bin/install.ts', code: 7, message: '' });
  });

  test('no --cwd override -> defaults to process.cwd()', () => {
    let seenOpts: { cwd?: string; stdio: 'inherit' } | undefined;
    runInstallDelegate([], {
      scriptPath: '/fake/bin/install.ts',
      spawn: (_cmd, _args, opts) => {
        seenOpts = opts;
        return { status: 0, stdout: '', stderr: '' };
      },
    });
    expect(seenOpts?.cwd).toBe(process.cwd());
  });

  test('spawn error (bun not on PATH) -> code 1, a clear diagnostic message, never throws', () => {
    const r = runInstallDelegate([], {
      scriptPath: '/fake/bin/install.ts',
      spawn: () => ({ status: null, stdout: '', stderr: '', error: new Error('ENOENT') }),
    });
    expect(r.available).toBe(true);
    expect(r.code).toBe(1);
    expect(r.message).toMatch(/failed to spawn.*bun.*ENOENT/);
  });

  test('a null exit status with no error -> code falls back to 1, never null/undefined', () => {
    const r = runInstallDelegate([], {
      scriptPath: '/fake/bin/install.ts',
      spawn: () => ({ status: null, stdout: '', stderr: '' }),
    });
    expect(r.code).toBe(1);
  });
});
