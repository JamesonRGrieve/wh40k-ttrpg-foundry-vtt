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
 * Default behaviour: capture just the most recent open
 * `ApplicationV2`/dialog/sheet element (its visible bounds), with the
 * GAME PAUSED overlay dismissed so the UI is readable. Falls back to a
 * viewport capture only when no application root is found.
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

import { mkdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import type { Locator, Page } from '@playwright/test';

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
 * Dismiss Foundry's GAME PAUSED overlay + bring an `Application`/
 * `ApplicationV2`/dialog/sheet element into a visible, screenshot-ready
 * position. Tries to:
 *
 *   1. Unpause the game (so the PAUSED banner doesn't dominate the
 *      capture).
 *   2. Find the most recently rendered floating application root —
 *      either an ApplicationV2 (`.application[data-application-part]`
 *      / `[data-appid]` / `dialog.application`) or an older
 *      `#sheet-*` Application — and force its position to a sensible
 *      on-screen rectangle (top-left, 800×900) so the capture isn't
 *      clipped to the chat-sidebar edge or hidden behind the canvas.
 *   3. Scroll the element into view.
 *
 * Returns a Locator if an application root was prepared, else null.
 */
async function prepareApplicationForCapture(page: Page): Promise<Locator | null> {
    try {
        // Unpause the game so the PAUSED banner doesn't dominate captures.
        // Idempotent — if the game is already running this is a no-op.
        await page.evaluate(() => {
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- browser-side: Foundry `game` global is runtime-only
                const g = globalThis as any;
                const hasTogglePause = Boolean(g.game?.togglePause);
                if (hasTogglePause && g.game?.paused === true) g.game.togglePause(false);
            } catch {
                /* ignore */
            }
        });
    } catch {
        /* ignore */
    }

    // Selector cascade — most specific first. ApplicationV2 uses
    // `.application`; older dialogs use `.window-app` / `#sheet-*`.
    const candidates = [
        '.application[data-application-part]',
        'dialog.application[open]',
        '.application:not([hidden])',
        '.window-app:not(.minimized)',
        '#sheet-character',
        '#sheet-item',
    ];
    for (const sel of candidates) {
        const loc = page.locator(sel).last();
        try {
            const count = await loc.count();
            if (count === 0) continue;
            // Force the application onto the visible top-left so the
            // screenshot isn't off-screen. Width/height defaults below
            // cover most sheets without forcing tiny dialogs to grow.
            await page.evaluate((selector: string) => {
                const el = document.querySelectorAll<HTMLElement>(selector);
                const last = el[el.length - 1];
                if (last === undefined) return;
                last.style.left = '24px';
                last.style.top = '24px';
                last.style.right = 'auto';
                last.style.bottom = 'auto';
                last.style.transform = 'none';
                last.style.zIndex = '100';
                last.scrollIntoView({ block: 'start', inline: 'start' });
            }, sel);
            // Wait one frame for the position change to settle visually.
            await page.waitForTimeout(80);
            return loc;
        } catch {
            /* continue */
        }
    }
    return null;
}

/**
 * Capture a PNG of the active sheet/dialog/application (default) or
 * the full page.
 *
 * @param page      The Playwright Page.
 * @param label     A short identifier — e.g. 'render', 'after-drop'.
 * @param opts      Pass `{ selector: '...' }` to capture a specific
 *                  element (useful for panels embedded in a sheet).
 *                  Pass `{ fullPage: true }` to snapshot the entire
 *                  page bypassing the application detection (useful
 *                  for canvas / scene captures). Default: capture the
 *                  most recently rendered application root.
 */
export async function snap(page: Page, label: string, opts: { fullPage?: boolean; selector?: string } = {}): Promise<string | null> {
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
        if (opts.fullPage === true) {
            await page.screenshot({ path, fullPage: true });
            return path;
        }

        // Explicit selector: capture just that element.
        if (typeof opts.selector === 'string' && opts.selector !== '') {
            const loc = page.locator(opts.selector).first();
            if ((await loc.count()) > 0) {
                await loc.screenshot({ path });
                return path;
            }
            // Selector requested but not found → fall through to default
            // application capture so the spec still gets a PNG.
        }

        // Default: prep + capture the most recent ApplicationV2 / sheet /
        // dialog element on-screen.
        const appLoc = await prepareApplicationForCapture(page);
        if (appLoc !== null) {
            await appLoc.screenshot({ path });
            return path;
        }

        // Last-resort fallback: full-page capture so the spec still has
        // a record of the runtime state for debugging.
        await page.screenshot({ path, fullPage: true });
        return path;
    } catch {
        return null;
    }
}
