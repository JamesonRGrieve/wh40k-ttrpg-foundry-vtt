import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test as base } from '@playwright/test';

/**
 * Playwright `test` extended with a per-page V8 JS coverage capture.
 * Every spec that imports from here (instead of from '@playwright/test')
 * automatically dumps its coverage entries to `.e2e-raw-coverage/`. After
 * the suite finishes, `scripts/e2e-coverage.mjs` converts those entries
 * via `v8-to-istanbul` (consuming the dist/*.js.map source maps) into an
 * istanbul-compatible coverage report against `src/module/**\/*.ts`.
 *
 * Coverage is only collected for URLs under /systems/wh40k-rpg/module/ —
 * Foundry's own client code is intentionally excluded.
 */

const RAW_DIR = resolve(__dirname, '..', '..', '..', '.e2e-raw-coverage');
mkdirSync(RAW_DIR, { recursive: true });

let runCounter = 0;

export const test = base.extend({
    page: async ({ page }, use, testInfo) => {
        try {
            await page.coverage.startJSCoverage({ resetOnNavigation: false });
        } catch {
            // page.coverage is chromium-only; non-chromium projects skip.
        }
        await use(page);
        try {
            const entries = await page.coverage.stopJSCoverage();
            const filtered = entries.filter((e) => e.url.includes('/systems/wh40k-rpg/module/') && e.url.endsWith('.js'));
            if (filtered.length === 0) return;
            const id = `${String(++runCounter).padStart(4, '0')}-${testInfo.title.replace(/[^a-z0-9]/gi, '_').slice(0, 60)}`;
            writeFileSync(resolve(RAW_DIR, `${id}.json`), JSON.stringify(filtered));
        } catch {
            // ignore — coverage capture is best-effort
        }
    },
});

export { expect } from '@playwright/test';
