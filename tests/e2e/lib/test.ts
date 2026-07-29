import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test as base } from '@playwright/test';
import { type CapturedError, formatCapturedError, unexpectedErrors } from './console-guard';

/**
 * Playwright `test` extended with two things every Tier B spec gets for free by
 * importing from here (instead of from '@playwright/test'):
 *
 *  1. Per-page V8 JS coverage capture. Entries are dumped to `.e2e-raw-coverage/`;
 *     `scripts/e2e-coverage.mjs` converts them (via `v8-to-istanbul`, consuming
 *     the dist/*.js.map source maps) into a report against `src/module/**\/*.ts`.
 *     Coverage is only collected for URLs under /systems/wh40k-rpg/module/ —
 *     Foundry's own client code is intentionally excluded.
 *
 *  2. A GLOBAL browser-error guard. A `pageerror` (uncaught exception) or a
 *     `console.error` that is not known framework noise (see console-guard.ts)
 *     fails the test — so browser errors are caught in EVERY spec, not just the
 *     ~78% that hand-rolled their own `page.on('pageerror', …)` listener, and
 *     without duplicating that boilerplate. Set `E2E_CONSOLE_GUARD=off` to
 *     disable, or `=report` to only append captures to `.e2e-console-report.jsonl`
 *     (for calibrating IGNORED_PATTERNS) without failing.
 */

const RAW_DIR = resolve(__dirname, '..', '..', '..', '.e2e-raw-coverage');
const REPORT_PATH = resolve(__dirname, '..', '..', '..', '.e2e-console-report.jsonl');
mkdirSync(RAW_DIR, { recursive: true });

const GUARD_MODE = process.env['E2E_CONSOLE_GUARD'] ?? 'on';

let runCounter = 0;

export const test = base.extend({
    page: async ({ page }, use, testInfo) => {
        // ── Browser-error guard: capture BEFORE the test runs so nothing is missed.
        const errors: CapturedError[] = [];
        const onPageError = (err: Error): void => {
            errors.push(err.stack === undefined ? { kind: 'pageerror', text: err.message } : { kind: 'pageerror', text: err.message, stack: err.stack });
        };
        const onConsole = (msg: { type: () => string; text: () => string }): void => {
            if (msg.type() === 'error') errors.push({ kind: 'console.error', text: msg.text() });
        };
        if (GUARD_MODE !== 'off') {
            page.on('pageerror', onPageError);
            page.on('console', onConsole);
        }

        try {
            await page.coverage.startJSCoverage({ resetOnNavigation: false });
        } catch {
            // page.coverage is chromium-only; non-chromium projects skip.
        }

        await use(page);

        try {
            const entries = await page.coverage.stopJSCoverage();
            const filtered = entries.filter((e) => e.url.includes('/systems/wh40k-rpg/module/') && e.url.endsWith('.js'));
            if (filtered.length > 0) {
                // Prefix with the parallel slot so concurrent workers (each a
                // separate process with its own runCounter) never collide on a
                // shared filename when two specs share a title.
                const slot = String(testInfo.parallelIndex).padStart(2, '0');
                const id = `w${slot}-${String(++runCounter).padStart(4, '0')}-${testInfo.title.replace(/[^a-z0-9]/gi, '_').slice(0, 60)}`;
                writeFileSync(resolve(RAW_DIR, `${id}.json`), JSON.stringify(filtered));
            }
        } catch {
            // ignore — coverage capture is best-effort
        }

        if (GUARD_MODE === 'off') return;
        page.off('pageerror', onPageError);
        page.off('console', onConsole);

        if (GUARD_MODE === 'report') {
            if (errors.length > 0) appendFileSync(REPORT_PATH, `${errors.map((e) => JSON.stringify({ ...e, spec: testInfo.title })).join('\n')}\n`);
            return;
        }
        // Only enforce on a test that would otherwise PASS — never mask a real
        // failure or convert a skip into a failure with teardown noise.
        if (testInfo.status !== 'passed') return;
        const unexpected = unexpectedErrors(errors);
        if (unexpected.length > 0) {
            const list = unexpected.slice(0, 10).map(formatCapturedError).join('\n');
            throw new Error(`Browser emitted ${unexpected.length} unexpected error(s) (global console guard; allowlist in lib/console-guard.ts):\n${list}`);
        }
    },
});

export { expect } from '@playwright/test';
