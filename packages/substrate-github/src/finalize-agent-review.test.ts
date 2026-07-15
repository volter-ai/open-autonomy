import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REVIEW_RESULT_JSON_SCHEMA, REVIEW_RESULT_SCHEMA_ID } from '@open-autonomy/core';
import {
  MAX_RESULT_BYTES,
  REVIEW_RESULT_SCHEMA,
  decideFinalization,
  parseReviewResult,
  type ReviewResult,
} from './runtime/finalize-agent-review';

const SHA = 'a'.repeat(40);
const valid = (overrides: Partial<ReviewResult> = {}): ReviewResult => ({
  schema: REVIEW_RESULT_SCHEMA,
  pr: 42,
  headSha: SHA,
  verdict: 'success',
  outcome: 'approved',
  summary: 'review passed',
  findings: [],
  humanApprovalRequired: false,
  ...overrides,
});

describe('trusted agent-review finalization', () => {
  test('the standalone trusted effect stays pinned to the core standard result contract', () => {
    expect(REVIEW_RESULT_SCHEMA).toBe(REVIEW_RESULT_SCHEMA_ID);
    expect(REVIEW_RESULT_JSON_SCHEMA.required).toEqual([
      'schema', 'pr', 'headSha', 'verdict', 'outcome', 'summary', 'findings', 'humanApprovalRequired',
    ]);
    expect(REVIEW_RESULT_JSON_SCHEMA.additionalProperties).toBe(false);
    const dir = mkdtempSync(join(tmpdir(), 'oa-review-contract-'));
    const path = join(dir, 'result.json');
    try {
      writeFileSync(path, JSON.stringify(valid()));
      expect(() => parseReviewResult(path)).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test('rejects fields outside the standard review-result contract', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-review-contract-'));
    const path = join(dir, 'result.json');
    try {
      writeFileSync(path, JSON.stringify({ ...valid(), undeclared: true }));
      expect(() => parseReviewResult(path)).toThrow('unknown fields: undeclared');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test('requires a verified typed human task exactly when review parks for a person', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-review-contract-'));
    const path = join(dir, 'result.json');
    try {
      writeFileSync(path, JSON.stringify(valid({ verdict: 'failure', outcome: 'human-required' })));
      expect(() => parseReviewResult(path)).toThrow('humanTask.ask');
      writeFileSync(path, JSON.stringify(valid({ verdict: 'failure', outcome: 'changes-requested', humanTask: {
        ask: 'decide', assignTo: 'maintainer',
        completion: { ac: 'decision recorded', via: 'command', check: 'deterministic' },
      } })));
      expect(() => parseReviewResult(path)).toThrow('only valid for a human-required outcome');
      writeFileSync(path, JSON.stringify(valid({ verdict: 'failure', outcome: 'human-required', humanTask: {
        ask: 'decide', assignTo: 'maintainer', undeclared: true,
        completion: { ac: 'decision recorded', via: 'command', check: 'deterministic' },
      } as never })));
      expect(() => parseReviewResult(path)).toThrow('humanTask has unknown fields: undeclared');
      writeFileSync(path, JSON.stringify(valid({ verdict: 'failure', outcome: 'human-required', humanTask: {
        ask: 'Decide and reply with /agent decide <decision>.', assignTo: 'maintainer',
        completion: { ac: 'An authorized maintainer records the decision.', via: 'command', check: 'deterministic' },
      } })));
      expect(() => parseReviewResult(path)).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  test('a later model-job failure overrides an already-written success artifact', () => {
    expect(decideFinalization({ jobResult: 'failure', expectedPr: 42, expectedSha: SHA, artifact: valid() }))
      .toEqual({ state: 'failure', reason: 'reviewer job concluded failure' });
  });

  test('only an exact PR + current-head binding can become success', () => {
    expect(decideFinalization({ jobResult: 'success', expectedPr: 42, expectedSha: SHA, artifact: valid() }).state)
      .toBe('success');
    expect(decideFinalization({ jobResult: 'success', expectedPr: 43, expectedSha: SHA, artifact: valid() }).state)
      .toBe('failure');
    expect(decideFinalization({ jobResult: 'success', expectedPr: 42, expectedSha: 'b'.repeat(40), artifact: valid() }).state)
      .toBe('failure');
  });

  test('missing or malformed output fails closed; a lane skip remains status-neutral', () => {
    expect(decideFinalization({ jobResult: 'success', expectedPr: 42, expectedSha: SHA }).state).toBe('failure');
    expect(decideFinalization({ jobResult: 'success', expectedPr: 42, expectedSha: SHA, artifactError: 'bad json' }).state)
      .toBe('failure');
    expect(decideFinalization({ jobResult: 'success', expectedPr: 42, expectedSha: SHA,
      artifact: valid({ verdict: 'skip', outcome: 'not-applicable' }) }).state).toBe('skip');
  });

  test('oversized output from a resource-exhausted/large review is rejected without trusting partial JSON', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-review-result-'));
    const path = join(dir, 'review.json');
    try {
      mkdirSync(dir, { recursive: true });
      writeFileSync(path, JSON.stringify({ ...valid(), summary: 'x'.repeat(MAX_RESULT_BYTES) }));
      expect(() => parseReviewResult(path)).toThrow('exceeds');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
