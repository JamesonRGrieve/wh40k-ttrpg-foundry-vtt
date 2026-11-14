import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test as base, type Page, type TestInfo } from '@playwright/test';
import { type CapturedError, formatCapturedError, unexpectedErrors } from './console-guard';
import { installDialogOpener } from './dialog-opener';
import { installInPageHelpers } from './in-page-helpers';
import { installModuleShims } from './module-shim';

/**
 * Playwright `test` extended with the things every Tier B spec gets for free by
 * importing from here (instead of from '@playwright/test'):
 *
 *  1. Per-page V8 JS coverage capture. Entries are dumped to `.e2e-raw-coverage/`;
 *     `scripts/e2e-coverage.mjs` converts them (via `v8-to-istanbul`, consuming
 *     the bundle's source map, dist/module/wh40k-rpg.js.map) into a report against `src/module/**\/*.ts`.
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
 *
 *  3. In-page helpers on every document the page loads: `globalThis.wh40kE2E`
 *     (scaled `withTimeout` / `waitFor` / `settle`, see in-page-helpers.ts) and
 *     `globalThis.wh40kOpenDialog` (see dialog-opener.ts).
 *
 *  4. Per-file module URLs (`/systems/wh40k-rpg/module/<path>.js`) served as
 *     re-exports of the bundle's live modules (see module-shim.ts, #705).
 *
 *  5. `openClient()`: a second (third, …) browser client in its own context — a
 *     separate Foundry session that joins as another user — with the same coverage,
 *     error guard and in-page helpers as `page`. For the specs that need a player
 *     and the GM at the table together.
 *
 *  6. A failure trace (#741): a failing test's browser console, page errors and
 *     navigations, timestamped, printed as `[browser-trace]` and attached to the
 *     report.
 */

const RAW_DIR = resolve(__dirname, '..', '..', '..', '.e2e-raw-coverage');
const REPORT_PATH = resolve(__dirname, '..', '..', '..', '.e2e-console-report.jsonl');
mkdirSync(RAW_DIR, { recursive: true });

const GUARD_MODE = process.env['E2E_CONSOLE_GUARD'] ?? 'on';

/** Lines of browser activity kept per page for a failing test's trace (#741). */
const TRACE_LINES = 300;

let runCounter = 0;

/**
 * Instrument a page for a test: start the error guard and coverage capture and
 * install the in-page helpers. The returned `finish` dumps the coverage and,
 * for a test that would otherwise pass, fails it on an unexpected browser error.
 */
async function instrumentPage(page: Page, testInfo: TestInfo, clientLabel: string): Promise<() => Promise<void>> {
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

    // ── Failure trace (#741): every console line, page error and navigation of
    // this page, timestamped and bounded. Printed and attached only when the test
    // fails, so a failure that depends on run order or machine load can be read
    // from the gate's log instead of being reproduced (a socket reconnect, a
    // reload, a write that threw).
    const trace: string[] = [];
    const started = Date.now();
    const note = (line: string): void => {
        trace.push(`+${String(Date.now() - started).padStart(6)}ms ${line}`);
        if (trace.length > TRACE_LINES) trace.shift();
    };
    page.on('console', (msg) => {
        // Core logs one line per compendium index built at boot (~800); they would push everything else out.
        if (!msg.text().includes('Constructed index of')) note(`${msg.type()}: ${msg.text().slice(0, 400)}`);
    });
    page.on('pageerror', (err) => {
        note(`pageerror: ${err.message.slice(0, 400)}`);
    });
    page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) note(`navigated: ${frame.url()}`);
    });
    page.on('close', () => {
        note('page closed');
    });

    try {
        await page.coverage.startJSCoverage({ resetOnNavigation: false });
    } catch {
        // page.coverage is chromium-only; non-chromium projects skip.
    }
    await installInPageHelpers(page);
    await installDialogOpener(page);
    await installModuleShims(page);

    return async (): Promise<void> => {
        if (testInfo.status !== testInfo.expectedStatus && trace.length > 0) {
            const body = trace.join('\n');
            await testInfo.attach(`${clientLabel}browser-trace`, { body, contentType: 'text/plain' });
            process.stdout.write(`[browser-trace] ${clientLabel}${testInfo.title}\n${body}\n[/browser-trace]\n`);
        }
        try {
            const entries = await page.coverage.stopJSCoverage();
            const filtered = entries.filter((e) => e.url.includes('/systems/wh40k-rpg/module/') && e.url.endsWith('.js'));
            if (filtered.length > 0) {
                // Prefix with the parallel slot so concurrent workers (each a
                // separate process with its own runCounter) never collide on a
                // shared filename when two specs share a title.
                const slot = String(testInfo.parallelIndex).padStart(2, '0');
                const id = `w${slot}-${String(++runCounter).padStart(4, '0')}-${clientLabel}${testInfo.title.replace(/[^a-z0-9]/gi, '_').slice(0, 60)}`;
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
    };
}

export const test = base.extend<{ openClient: () => Promise<Page> }>({
    page: async ({ page }, use, testInfo) => {
        const finish = await instrumentPage(page, testInfo, '');
        await use(page);
        await finish();
    },
    openClient: async ({ browser }, use, testInfo) => {
        const opened: Array<{ close: () => Promise<void>; finish: () => Promise<void> }> = [];
        await use(async () => {
            const context = await browser.newContext();
            const page = await context.newPage();
            const finish = await instrumentPage(page, testInfo, `c${String(opened.length + 1)}-`);
            opened.push({ close: async () => context.close(), finish });
            return page;
        });
        for (const client of opened) {
            // eslint-disable-next-line no-await-in-loop -- each client's coverage is dumped and its guard checked before its context closes
            await client.finish();
            // eslint-disable-next-line no-await-in-loop -- see above
            await client.close();
        }
    },
});

export { expect } from '@playwright/test';
