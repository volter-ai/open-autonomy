#!/usr/bin/env node
// demo-runner.mjs — the ONE recorded-flow demo harness this profile's visual-evidence
// pipeline is built on. Every demo/visual-state script under playwright-demos/ (see
// policy.box.visual_evidence.demo_dir in ir.yml) MUST drive its flow through runDemo()
// below — never a hand-rolled `chromium.launch()` / `page.screenshot()` lifecycle. See
// standards/visual-evidence.md and the develop skill's §Baseline/§DryRun.
//
// Ported from the canonical visual-edit scaffold
// (visual-edit-scaffold/apps/web/.visual-edit/playwright-demos/lib/demo-runner.mjs) and
// proven live on a real adopter install driving its own world-based evidence flow (baseline
// RED -> feature GREEN, both re-run clean against a sealed twin world). Capabilities:
//   - recordVideo: the whole flow is captured as ONE WebM (demo.webm in the run dir); every
//     step's screenshot is a MOMENT of that video, stamped with videoTimeMs (offset from
//     recording start) — a screenshot is a video moment, never a standalone capture.
//   - per-step moments: screenshot + settled ARIA snapshot (waitForStableAria) + innerText +
//     narration.
//   - enforced validateDemoStep: runDemo REFUSES to run without one, and demo authors must
//     default-throw on unknown step ids — every step is validated, no silent skips.
//   - diagnostics: console warnings/errors + pageerrors -> diagnostics.json, issue count in
//     summary.json.
//   - rich summary.json (see shape below).
//
// OA extensions layered on top (superset schema — nothing canonical removed):
//   - runId / script / mode (e.g. baseline|dryrun) at the top level, acIds on each step,
//     runError as {message, stack} — the fields scripts/evidence-attach.mjs and the bookend
//     discipline (standards/visual-evidence.md) consume.
//   - top-level evidence.screenshot (last captured moment) — kept because
//     scripts/world-smoke.mjs's capture gate reads it.
//   - prepare({browser, context}) hook so callers can inject a REAL session (e.g. an
//     OTP-from-store login) before the first page exists.
//
// summary.json shape (superset):
//   { generatedAt, runner, runId, script, mode, gitSha, gitDirty, gitBranch,
//     demo:{slug,name}, status,
//     appUrl, outDir, video, startedAt, finishedAt, total, pass, fail,
//     runError:{message,stack}|null, diagnostics:{issues},
//     evidence:{screenshot},
//     steps:[{ id, name, narration, acIds, presentation?, status, startedAt,
//              durationMs, videoTimeMs, evidence:{screenshot,text,aria},
//              error? }] }
//
// Framework-free: plain .mjs, Playwright only.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { waitForStableAria } from './frame-capture.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../..');
const DEFAULT_TIMEOUT = Number(process.env.PLAYWRIGHT_DEMO_TIMEOUT_MS || 30_000);
const DEFAULT_VIEWPORT = { width: 1440, height: 900 };

export function isDirectRun(importMetaUrl) {
  return importMetaUrl === pathToFileURL(process.argv[1] || '').href;
}

export function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'demo';
}

export async function runDemo({
  demo,
  mode = null,
  steps: demoSteps,
  runDemoSteps,
  validateDemoStep,
  appUrl = (process.env.VISUAL_EDIT_APP_URL || process.env.APP_URL || 'http://localhost:3000')
    .replace(/\/$/, '')
    .replace('127.0.0.1', 'localhost'),
  startUrl = null,
  contextOptions = {},
  prepare = null,
  runId: runIdOption = null,
  outDir: outDirOption = null,
  defaultTimeoutMs = DEFAULT_TIMEOUT,
}) {
  if (!demo?.slug) throw new Error('runDemo requires demo.slug');
  if (!demo?.name) throw new Error('runDemo requires demo.name');
  if (!Array.isArray(demoSteps) || demoSteps.length === 0) throw new Error('runDemo requires steps');
  if (typeof runDemoSteps !== 'function') throw new Error('runDemo requires runDemoSteps(ctx)');
  if (typeof validateDemoStep !== 'function') {
    throw new Error('runDemo requires validateDemoStep(ctx, stepId) — every step must be validated, and the validator must default-throw on unknown step ids');
  }

  const runId = runIdOption
    || process.env.PLAYWRIGHT_DEMO_RUN_ID
    || process.env.VISUAL_STATE_RUN_ID
    || `${demo.slug}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const outDir = path.resolve(
    outDirOption
    || process.env.PLAYWRIGHT_DEMO_OUT_DIR
    || process.env.VISUAL_STATE_OUT_DIR
    || path.join(ROOT, 'apps/web/.visual-edit/runs', runId),
  );
  fs.mkdirSync(outDir, { recursive: true });

  const stepDefinitions = new Map();
  for (const item of demoSteps) {
    if (!item?.id) throw new Error('demo step requires id');
    if (!item?.name) throw new Error(`demo step ${item.id} requires name`);
    if (!item?.narration) throw new Error(`demo step ${item.id} requires narration`);
    if (item.acIds !== undefined && !Array.isArray(item.acIds)) throw new Error(`demo step ${item.id} acIds must be an array`);
    if (stepDefinitions.has(item.id)) throw new Error(`duplicate demo step id: ${item.id}`);
    stepDefinitions.set(item.id, item);
  }

  const startedAt = new Date().toISOString();
  // Captured ONCE at run start so it's stable even if the tree changes mid-run.
  // Best-effort: git provenance must never break a demo run.
  const { gitSha, gitDirty, gitBranch } = captureGitProvenance(HERE);
  const viewport = contextOptions.viewport || DEFAULT_VIEWPORT;

  let browser;
  let context;
  let page;
  let videoFile = null;
  let videoEpochMs = null;
  let runError = null;
  const results = [];
  const diagnostics = [];

  try {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      ...contextOptions,
      viewport,
      recordVideo: { dir: outDir, size: viewport },
    });
    if (prepare) await prepare({ browser, context, appUrl });
    page = await context.newPage();
    videoEpochMs = Date.now(); // video recording starts with the first page
    page.setDefaultTimeout(defaultTimeoutMs);
    attachDiagnostics(page, diagnostics);
    if (startUrl) await page.goto(startUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    const ctx = createDemoContext({ page, step, outDir, appUrl, defaultTimeoutMs });
    await runDemoSteps(ctx);
  } catch (error) {
    runError = error;
  } finally {
    videoFile = await closeTarget({ browser, context, page, outDir });
    writeJson(path.join(outDir, 'diagnostics.json'), diagnostics);
    const lastEvidence = [...results].reverse().find((item) => item.evidence?.screenshot);
    writeJson(path.join(outDir, 'summary.json'), {
      generatedAt: new Date().toISOString(),
      runner: 'visual-edit-demo-runner',
      runId,
      script: demo.script || null,
      mode,
      gitSha,
      gitDirty,
      gitBranch,
      demo: { slug: demo.slug, name: demo.name },
      status: runError ? 'fail' : 'pass',
      appUrl,
      outDir,
      video: videoFile,
      startedAt,
      finishedAt: new Date().toISOString(),
      total: results.length,
      pass: results.filter((item) => item.status === 'pass').length,
      fail: results.filter((item) => item.status !== 'pass').length,
      runError: runError ? {
        message: runError instanceof Error ? runError.message : String(runError),
        stack: runError instanceof Error ? runError.stack || null : null,
      } : null,
      diagnostics: { issues: diagnostics.length },
      evidence: lastEvidence ? { screenshot: lastEvidence.evidence.screenshot } : {},
      steps: results,
    });
    console.log(`wrote ${outDir}`);
  }

  if (runError) throw runError;
  return { runId, outDir };

  async function step(stepId, action) {
    const stepInfo = stepDefinitions.get(stepId);
    if (!stepInfo) throw new Error(`unknown demo step id: ${stepId}`);
    const stepStartedAt = Date.now();
    const index = results.length + 1;
    const prefix = `${String(index).padStart(2, '0')}-${slugify(stepInfo.id)}`;
    const result = {
      id: stepInfo.id,
      name: stepInfo.name,
      narration: stepInfo.narration,
      acIds: stepInfo.acIds || [],
      ...(stepInfo.presentation ? { presentation: stepInfo.presentation } : {}),
      status: 'pass',
      startedAt: new Date(stepStartedAt).toISOString(),
      videoTimeMs: null,
      evidence: {},
    };
    try {
      await action();
      await validateDemoStep(createDemoContext({ page, step, outDir, appUrl, defaultTimeoutMs }), stepInfo.id);
      await captureEvidence(page, outDir, prefix, result, videoEpochMs);
    } catch (error) {
      result.status = 'fail';
      result.error = error instanceof Error ? error.message : String(error);
      await captureEvidence(page, outDir, `${prefix}-fail`, result, videoEpochMs).catch(() => {});
      throw error;
    } finally {
      result.durationMs = Date.now() - stepStartedAt;
      results.push(result);
    }
  }
}

function createDemoContext({ page, step, outDir, appUrl, defaultTimeoutMs }) {
  return {
    page,
    step,
    outDir,
    appUrl,
    assertText: async (items) => {
      for (const item of items) await page.getByText(item).waitFor({ timeout: defaultTimeoutMs });
    },
    typeLikeHuman: async (locator, text) => {
      await locator.click();
      await locator.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A').catch(() => {});
      await locator.type(text, { delay: Number(process.env.PLAYWRIGHT_DEMO_TYPE_DELAY_MS || 0) });
    },
    waitForStableAria: (timeoutMs) => waitForStableAria(page, timeoutMs),
  };
}

async function closeTarget({ browser, context, page, outDir }) {
  let videoFile = null;
  if (context && page?.video()) {
    const video = page.video();
    await context.close().catch(() => {});
    const generatedVideoPath = await video.path().catch(() => '');
    if (generatedVideoPath && fs.existsSync(generatedVideoPath)) {
      videoFile = 'demo.webm';
      fs.renameSync(generatedVideoPath, path.join(outDir, videoFile));
    }
  } else if (context) {
    await context.close().catch(() => {});
  }
  await browser?.close().catch(() => {});
  return videoFile;
}

async function captureEvidence(page, outDir, prefix, result, videoEpochMs) {
  const screenshot = `${prefix}.png`;
  const textFile = `${prefix}.txt`;
  const ariaFile = `${prefix}.aria.json`;
  // Let the accessibility tree settle so the moment is a stable frame, then
  // stamp its offset into the recording BEFORE taking the screenshot.
  const aria = await waitForStableAria(page, 5_000).catch((error) => `aria snapshot unavailable: ${error.message}`);
  result.videoTimeMs = videoEpochMs === null ? null : Date.now() - videoEpochMs;
  await page.screenshot({ path: path.join(outDir, screenshot), fullPage: false });
  const text = await page.locator('body').innerText().catch(() => '');
  fs.writeFileSync(path.join(outDir, textFile), `${text}\n`);
  fs.writeFileSync(path.join(outDir, ariaFile), `${JSON.stringify({ aria }, null, 2)}\n`);
  result.evidence = { screenshot, text: textFile, aria: ariaFile };
}

function attachDiagnostics(page, diagnostics) {
  page.on('console', (message) => {
    if (message.type() === 'warning' || message.type() === 'error') {
      diagnostics.push({ type: 'console', level: message.type(), text: message.text(), at: new Date().toISOString() });
    }
  });
  page.on('pageerror', (error) => {
    diagnostics.push({ type: 'pageerror', text: error.message, at: new Date().toISOString() });
  });
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

// Evidence-integrity provenance: stamp WHICH code revision the demo ran
// against, so a baseline run's world logs being overwritten later doesn't
// erase the record of what SHA produced them. Best-effort — resolves the
// repo root via `git rev-parse --show-toplevel` (the runner may execute
// from a worktree, so this is never hardcoded) and never throws; git
// failures must not break a demo run.
function captureGitProvenance(cwd) {
  let root;
  try {
    root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return { gitSha: null, gitDirty: null, gitBranch: null };
  }
  const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  let gitSha = null;
  let gitDirty = null;
  let gitBranch = null;
  try {
    gitSha = git(['rev-parse', 'HEAD']);
  } catch {
    gitSha = null;
  }
  try {
    gitDirty = git(['status', '--porcelain']).length > 0;
  } catch {
    gitDirty = null;
  }
  try {
    gitBranch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  } catch {
    gitBranch = null;
  }
  return { gitSha, gitDirty, gitBranch };
}
