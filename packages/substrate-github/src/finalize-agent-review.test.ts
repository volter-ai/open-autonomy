import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REVIEW_RESULT_JSON_SCHEMA, REVIEW_RESULT_SCHEMA_ID } from '@open-autonomy/core';
import {
  MAX_RESULT_BYTES,
  MAX_REVIEW_SUMMARY_LENGTH,
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

  test('normalizes only an oversized summary and preserves the exact authority binding', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-review-summary-'));
    const path = join(dir, 'result.json');
    const original = valid({ summary: 'x'.repeat(MAX_REVIEW_SUMMARY_LENGTH + 73) });
    try {
      writeFileSync(path, JSON.stringify(original));
      const parsed = parseReviewResult(path);
      expect(parsed.summary.length).toBe(MAX_REVIEW_SUMMARY_LENGTH);
      expect(parsed.summary.endsWith('…')).toBe(true);
      expect({ ...parsed, summary: original.summary }).toEqual(original);
      expect(decideFinalization({ jobResult: 'success', expectedPr: original.pr, expectedSha: original.headSha,
        artifact: parsed }).state).toBe('success');
      expect(decideFinalization({ jobResult: 'success', expectedPr: original.pr + 1, expectedSha: original.headSha,
        artifact: parsed }).state).toBe('failure');
      expect(decideFinalization({ jobResult: 'success', expectedPr: original.pr, expectedSha: 'b'.repeat(40),
        artifact: parsed }).state).toBe('failure');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('summary normalization does not admit malformed result fields', () => {
    const dir = mkdtempSync(join(tmpdir(), 'oa-review-malformed-'));
    const path = join(dir, 'result.json');
    const oversized = 'x'.repeat(MAX_REVIEW_SUMMARY_LENGTH + 1);
    const malformed: Array<[Record<string, unknown>, string]> = [
      [{ ...valid(), summary: oversized, pr: 0 }, 'positive integer'],
      [{ ...valid(), summary: oversized, headSha: 'short' }, 'full commit SHA'],
      [{ ...valid(), summary: oversized, verdict: 'approve' }, 'verdict is invalid'],
      [{ ...valid(), summary: oversized, undeclared: true }, 'unknown fields'],
      [{ ...valid(), summary: '   ' }, '1..1000 characters'],
      [{ ...valid(), summary: 7 }, '1..1000 characters'],
    ];
    try {
      for (const [value, error] of malformed) {
        writeFileSync(path, JSON.stringify(value));
        expect(() => parseReviewResult(path)).toThrow(error);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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
