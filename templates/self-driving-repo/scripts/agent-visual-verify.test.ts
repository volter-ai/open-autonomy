import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chooseCommand, collectScreenshots, detectUi } from './agent-visual-verify.js';

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'visual-verify-'));
}

describe('visual-verify UI detection', () => {
  test('detects a playwright config', () => {
    const dir = tmp();
    writeFileSync(join(dir, 'playwright.config.ts'), 'export default {}\n');
    expect(detectUi(dir)).toBe(true);
  });

  test('detects a screenshots/e2e script or playwright dep', () => {
    const dir = tmp();
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { e2e: 'playwright test' } }));
    expect(detectUi(dir)).toBe(true);
    const dir2 = tmp();
    writeFileSync(join(dir2, 'package.json'), JSON.stringify({ devDependencies: { '@playwright/test': '^1' } }));
    expect(detectUi(dir2)).toBe(true);
  });

  test('no UI harness => false', () => {
    const dir = tmp();
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: { test: 'bun test' } }));
    expect(detectUi(dir)).toBe(false);
  });
});

describe('visual-verify command selection', () => {
  test('prefers screenshots, then test:e2e, then e2e, else playwright test', () => {
    expect(chooseCommand({ screenshots: 'x', e2e: 'y' })).toBe('bun run screenshots');
    expect(chooseCommand({ 'test:e2e': 'y' })).toBe('bun run test:e2e');
    expect(chooseCommand({ e2e: 'y' })).toBe('bun run e2e');
    expect(chooseCommand({})).toBe('bunx playwright test');
  });
});

describe('visual-verify screenshot harvesting', () => {
  test('collects png/jpg under conventional dirs', () => {
    const dir = tmp();
    mkdirSync(join(dir, 'screenshots'), { recursive: true });
    mkdirSync(join(dir, 'test-results', 'a'), { recursive: true });
    writeFileSync(join(dir, 'screenshots', 'home.png'), 'x');
    writeFileSync(join(dir, 'test-results', 'a', 'fail.jpg'), 'x');
    writeFileSync(join(dir, 'screenshots', 'notes.txt'), 'ignore');
    const found = collectScreenshots(dir).map((p) => p.replace(dir + '/', ''));
    expect(found).toContain('screenshots/home.png');
    expect(found).toContain('test-results/a/fail.jpg');
    expect(found).not.toContain('screenshots/notes.txt');
  });
});
