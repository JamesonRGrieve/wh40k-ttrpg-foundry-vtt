/**
 * Screenshot helper for Tier B e2e specs.
 *
 * Dumps PNGs into `.e2e-screenshots/` (gitignored). Call from a spec
 * via:
 *
 *   import { snap } from './lib/screenshot';
 *   await snap(page, 'compendium-browser-after-render');
 *
 * The file lands at `.e2e-screenshots/<spec-name>__<label>.png` where
 * `<spec-name>` is derived from the calling test file's name. Multiple
 * snaps in one test get a numeric suffix.
 *
 * Use cases:
 *   - inspecting why a sheet looks "off" headlessly (missing CSS, blank
 *     panels, theme cascade breaks);
 *   - capturing the state after a `_onDropItem` / action dispatch to
 *     verify the DOM mutation rendered visually;
 *   - diffing two snaps to confirm a CSS / template change.
 *
 * Screenshots are best-effort: they swallow errors so a missing
 * filesystem permission can't fail an otherwise-passing test.
 */

import type { Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const SCREENSHOT_DIR = resolve(__dirname, '..', '..', '..', '.e2e-screenshots');

let initialized = false;
function ensureDir(): void {
    if (initialized) return;
    try {
        mkdirSync(SCREENSHOT_DIR, { recursive: true });
        initialized = true;
    } catch {
        /* directory may already exist; non-fatal */
    }
}

const counters = new Map<string, number>();

function sanitize(s: string): string {
    return s.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Capture a PNG of the current page.
 *
 * @param page      The Playwright Page.
 * @param label     A short identifier — e.g. 'render', 'after-drop'.
 * @param opts      Pass `{ fullPage: false }` to snapshot only the viewport.
 *                  Default is `fullPage: true` so popout windows and
 *                  off-screen sheet parts are visible.
 */
export async function snap(page: Page, label: string, opts: { fullPage?: boolean } = {}): Promise<string | null> {
    ensureDir();

    // Best-effort: derive a spec name from the page's current URL or a
    // generic prefix if no test context is available.
    const specHint = basename(page.url() || 'page').split('?')[0] ?? 'page';
    const key = `${sanitize(specHint)}__${sanitize(label)}`;
    const n = (counters.get(key) ?? 0) + 1;
    counters.set(key, n);
    const suffix = n === 1 ? '' : `-${n}`;
    const path = resolve(SCREENSHOT_DIR, `${key}${suffix}.png`);

    try {
        await page.screenshot({ path, fullPage: opts.fullPage ?? true });
        return path;
    } catch {
        return null;
    }
}
