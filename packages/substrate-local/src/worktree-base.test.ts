// F-2/OA-02: the base ref for a NEW agent worktree branch is a function of the DECLARED code host, never
// of repo shape (never "does a remote exist", never "did the fetch succeed"). `worktreeBase` is the
// extracted pure decision (mirrors the `mergeInFlight` pattern) so the truth table below is testable
// without a live termfleet stack or a real git repo. See docs/adoption-fixes/OA-02-*.md for the full spec
// and ensureWorktree's comment in runner-frontend.ts for the caller that performs the fetch (github only).
import { describe, expect, test } from 'bun:test';
import { worktreeBase } from './runner-frontend';

describe('worktreeBase — truth table (spec AC-3)', () => {
  test('local-git + resolvable origin/<trunk> -> HEAD (never the remote, even when it resolves)', () => {
    expect(worktreeBase('local-git', true, 'main')).toBe('HEAD');
  });

  test('undeclared codeHost (\'\', e.g. the hello profile) + resolvable origin/<trunk> -> HEAD', () => {
    expect(worktreeBase('', true, 'main')).toBe('HEAD');
  });

  test('github + resolvable origin/<trunk> -> origin/<trunk>', () => {
    expect(worktreeBase('github', true, 'main')).toBe('origin/main');
  });

  test('github + unresolved origin/<trunk> (no remote / fetch failed) -> HEAD', () => {
    expect(worktreeBase('github', false, 'main')).toBe('HEAD');
  });
});
