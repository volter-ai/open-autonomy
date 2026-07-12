// frame-capture.mjs — page-readiness helpers for Playwright evidence capture.
//
// Ported from the canonical visual-edit scaffold, trimmed to the helpers the demo runner
// needs. Framework-free: plain .mjs, Playwright page objects only. Proven live on a real
// adopter install (see standards/visual-evidence.md and the develop skill's §Baseline/§DryRun,
// which drive this through demo-runner.mjs's runDemo()).

export function normalizeBaseUrl(value) {
  return value.replace(/\/$/, '');
}

export async function waitForImagesAndFonts(page) {
  await page.evaluate(async () => {
    if ('fonts' in document) {
      await document.fonts.ready;
    }

    const images = Array.from(document.images);
    await Promise.all(
      images.map(image => {
        if (image.complete) return Promise.resolve();
        return new Promise(resolve => {
          image.addEventListener('load', resolve, { once: true });
          image.addEventListener('error', resolve, { once: true });
        });
      }),
    );
  }).catch(() => {});
}

// Poll the accessibility tree until it stops changing (two consecutive
// identical snapshots) — the canonical "page has settled" signal used for
// moment capture. Returns the final ARIA snapshot text.
export async function waitForStableAria(page, timeoutMs = 10000) {
  const startedAt = Date.now();
  let previous = '';
  let stableCount = 0;
  let latest = '';

  while (Date.now() - startedAt < timeoutMs) {
    latest = await page.locator('body').ariaSnapshot().catch(() => '');
    if (latest && latest === previous) {
      stableCount += 1;
      if (stableCount >= 2) return latest;
    } else {
      stableCount = 0;
      previous = latest;
    }
    await page.waitForTimeout(300);
  }

  return latest || previous;
}

export async function waitForPageReady(page, { readySelector = null, waitMs = 500 } = {}) {
  await page.waitForLoadState('domcontentloaded', { timeout: 30000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});

  if (readySelector) {
    await page.locator(readySelector).first().waitFor({ state: 'visible', timeout: 15000 });
  }

  await waitForImagesAndFonts(page);
  const snapshot = await waitForStableAria(page);

  if (waitMs > 0) {
    await page.waitForTimeout(waitMs);
  }

  return snapshot;
}
