import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractReadSites, noReadSite, parseDocVars, readerCorpusText, undocumentedPublicAgentVars } from './check-doc-vars';

const TABLE = [
  '| Variable | Read by | Default when unset |',
  '|---|---|---|',
  '| `MODEL_PROXY_URL` | every agent job\'s mint/exchange steps | *(none — required)* |',
  '| `PUBLIC_AGENT_MODEL` | the per-run model allowlist | `deepseek/deepseek-v4-flash` |',
  '| `PUBLIC_AGENT_REPO_PAUSED` | every agent job\'s `if:` guard | unset (running) |',
  '',
].join('\n');

describe('parseDocVars — extracts PUBLIC_AGENT_*/MODEL_PROXY_* rows from the rollout table', () => {
  test('pulls the backtick-quoted names in the first column', () => {
    expect(parseDocVars(TABLE)).toEqual(['MODEL_PROXY_URL', 'PUBLIC_AGENT_MODEL', 'PUBLIC_AGENT_REPO_PAUSED']);
  });

  test('ignores non-table prose mentioning the same names', () => {
    const text = 'Set `PUBLIC_AGENT_REPO_PAUSED=true` (repository variable) to pause the fleet.\n';
    expect(parseDocVars(text)).toEqual([]);
  });

  test('ignores unrelated table rows', () => {
    const text = '| `TERMFLEET_PROVIDER_URL` | the local scheduler | unset |\n';
    expect(parseDocVars(text)).toEqual([]);
  });
});

describe('extractReadSites — a real read is vars.NAME or process.env.NAME', () => {
  test('finds a GitHub Actions vars.* reference', () => {
    expect(extractReadSites('run: echo "${{ vars.PUBLIC_AGENT_MODEL }}"')).toEqual(new Set(['PUBLIC_AGENT_MODEL']));
  });

  test('finds process.env dot and bracket forms', () => {
    const corpus = "const a = process.env.MODEL_PROXY_URL;\nconst b = process.env['PUBLIC_AGENT_MODEL'];";
    expect(extractReadSites(corpus)).toEqual(new Set(['MODEL_PROXY_URL', 'PUBLIC_AGENT_MODEL']));
  });

  test('a step-local env alias name is not itself a read of the aliased variable', () => {
    // pm.yml-style: PUBLIC_AGENT_CITED_VERSION is a LOCAL rename; the real read is the vars.* on the right.
    const corpus = 'env:\n  PUBLIC_AGENT_CITED_VERSION: ${{ vars.PUBLIC_AGENT_CLAUDE_CODE_VERSION }}\n';
    const reads = extractReadSites(corpus);
    expect(reads.has('PUBLIC_AGENT_CLAUDE_CODE_VERSION')).toBe(true);
    expect(reads.has('PUBLIC_AGENT_CITED_VERSION')).toBe(false);
  });
});

describe('noReadSite — docs rot: a documented var nothing reads', () => {
  test('flags a documented var absent from the corpus', () => {
    expect(noReadSite(['PUBLIC_AGENT_GHOST'], 'no reads here at all')).toEqual(['PUBLIC_AGENT_GHOST']);
  });

  test('passes a documented var with a real read site', () => {
    expect(noReadSite(['PUBLIC_AGENT_MODEL'], 'vars.PUBLIC_AGENT_MODEL')).toEqual([]);
  });
});

describe('undocumentedPublicAgentVars — symmetric: a read var missing from the table', () => {
  test('flags a PUBLIC_AGENT_* read that the table never lists', () => {
    expect(undocumentedPublicAgentVars([], 'vars.PUBLIC_AGENT_SECRET_KNOB')).toEqual(['PUBLIC_AGENT_SECRET_KNOB']);
  });

  test('MODEL_PROXY_* reads are not subject to the symmetric check', () => {
    // MODEL_PROXY_ADMIN_TOKEN / MODEL_PROXY_TOKEN are proxy-side secrets, not rollout-table variables.
    expect(undocumentedPublicAgentVars([], 'process.env.MODEL_PROXY_ADMIN_TOKEN')).toEqual([]);
  });

  test('passes when every read var is documented', () => {
    expect(undocumentedPublicAgentVars(['PUBLIC_AGENT_MODEL'], 'vars.PUBLIC_AGENT_MODEL')).toEqual([]);
  });
});

describe('readerCorpusText — scans exactly the emitted-install read sites', () => {
  test('includes workflows and scripts, excludes *.test.ts', () => {
    const dir = mkdtempSync(join(tmpdir(), 'doc-vars-'));
    mkdirSync(join(dir, '.github', 'workflows'), { recursive: true });
    mkdirSync(join(dir, 'scripts'), { recursive: true });
    writeFileSync(join(dir, '.github', 'workflows', 'developer.yml'), 'vars.PUBLIC_AGENT_MODEL');
    writeFileSync(join(dir, 'scripts', 'agent.ts'), 'process.env.PUBLIC_AGENT_MODEL');
    writeFileSync(join(dir, 'scripts', 'agent.test.ts'), 'process.env.PUBLIC_AGENT_TEST_ONLY');
    const corpus = readerCorpusText(dir);
    expect(corpus).toContain('PUBLIC_AGENT_MODEL');
    expect(corpus).not.toContain('PUBLIC_AGENT_TEST_ONLY');
  });

  test('a missing .github or scripts dir is simply not corpus', () => {
    const dir = mkdtempSync(join(tmpdir(), 'doc-vars-empty-'));
    expect(readerCorpusText(dir)).toBe('');
  });
});
