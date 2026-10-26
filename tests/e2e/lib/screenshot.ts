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
 * A capture is evidence, so it fails the test when it would not show its subject
 * (#700): a selector that matches nothing, an element with no size, an element
 * covered at its centre, or a default capture with no window open. The capture
 * moves the pointer away and hides the hover tooltip (unless `keepTooltip`), the
 * notifications, and, unless the subject is one of them, the persistent HUD windows.
 */

import { mkdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { scaledMs } from './timing';

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

/** The app ids of the persistent HUD windows (world time, scene environment), open in every world. */
const PERSISTENT_HUD_IDS = ['wh40k-world-time-widget', 'wh40k-scene-environment-widget'];
/** `:not(...)` excluding every persistent HUD window from an application selector. */
const NOT_HUD = PERSISTENT_HUD_IDS.map((id) => `:not(#${id})`).join('');

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
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global is injected by the licensed app; no shipped types
                const g = globalThis as unknown as { game?: { paused?: boolean; togglePause?: (state: boolean) => void } };
                const hasTogglePause = typeof g.game?.togglePause === 'function';
                if (hasTogglePause && g.game?.paused === true) g.game.togglePause?.(false);
            } catch {
                /* ignore */
            }
        });
    } catch {
        /* ignore */
    }

    // Selector cascade — most specific first. ApplicationV2 uses
    // `.application`; older dialogs use `.window-app` / `#sheet-*`.
    // The always-on HUD windows are never the default subject: they re-render
    // on every time or scene change, so one is often the last application in
    // the DOM and was captured in place of the window a spec had just opened.
    const candidates = [
        `.application[data-application-part]${NOT_HUD}`,
        'dialog.application[open]',
        `.application:not([hidden])${NOT_HUD}`,
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
                if (el.length === 0) return;
                const last = el[el.length - 1];
                last.style.left = '24px';
                last.style.top = '24px';
                last.style.right = 'auto';
                last.style.bottom = 'auto';
                last.style.transform = 'none';
                last.style.zIndex = '100';
                last.scrollIntoView({ block: 'start', inline: 'start' });
            }, sel);
            // Wait one frame for the position change to settle visually.
            await page.waitForTimeout(scaledMs(80));
            return loc;
        } catch {
            /* continue */
        }
    }
    return null;
}

/**
 * Applied by Playwright for the duration of each capture only. The cheap clear
 * removes the toasts on screen, but core queues notifications and shows the next
 * one up to the moment of the screenshot (a banner covered the top of an Only War
 * dialog capture), so the toast list and the collapsed sidebar's chat popouts are
 * also hidden while the PNG is taken.
 */
const CAPTURE_STYLE = '#notifications, #chat-notifications .chat-message { visibility: hidden !important; }';

/**
 * The default (subject-picking) capture also hides the persistent HUD windows:
 * they float over the window being captured (the time widget covered a Head Hit
 * card's critical effects). Explicit `selector` / `clip` captures keep them, since
 * the widget specs aim at them. `display`, not `visibility`: the widget's buttons
 * set their own visibility and showed through a hidden parent.
 */
const DEFAULT_CAPTURE_STYLE = `${CAPTURE_STYLE} ${PERSISTENT_HUD_IDS.map((id) => `#${id}`).join(', ')} { display: none !important; }`;

/** What {@link clearOverlays} clears beyond the cheap pass. */
interface OverlayClearOptions {
    /** Also close every floating application window (the expensive, state-changing part). */
    closeWindows: boolean;
    /** With `closeWindows`, keep the windows whose id contains this fragment. */
    keepIdFragment: string | null;
    /** Leave the hover tooltip up, when the tooltip is the subject of the capture. */
    keepTooltip?: boolean;
}

/**
 * Make the screen capture-clean. The cheap pass, run by every {@link snap}: unpause,
 * end any active tour and stop the welcome tour from starting later, hide any hover
 * tooltip, and dismiss every notification (the headless "no hardware acceleration" warning covered sheet
 * headers in most actor screenshots). With `closeWindows`, also close every floating
 * application window whose id does not contain `keepIdFragment`. Best-effort.
 *
 * The welcome tour is started by core a couple of seconds AFTER `ready` (it pans
 * to its default scene, waits, then calls `tour.start()` without re-checking its
 * status), so exiting the active tour alone misses a tour that has not started yet
 * and it then covers the next capture. Its `start` is replaced with a no-op for the
 * rest of the page session so the pending call does nothing.
 */
async function clearOverlays(page: Page, options: OverlayClearOptions): Promise<void> {
    try {
        await page.evaluate(async ({ closeWindows, keepIdFragment: keep, keepTooltip }: OverlayClearOptions) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals (`game`, `ui`, `foundry.applications.instances`) have no browser-side types
            const g = globalThis as unknown as {
                game?: {
                    paused?: boolean;
                    togglePause?: (state: boolean) => void;
                    tours?: { get?: (id: string) => { start?: () => Promise<void> } | undefined };
                    tooltip?: { deactivate?: () => void };
                };
                ui?: { notifications?: { clear?: () => void } };
                foundry?: {
                    applications?: { instances?: Map<string, { id?: string; close?: (o?: object) => Promise<void> }> };
                    nue?: { Tour?: { activeTour?: { exit?: () => void } | null } };
                };
            };
            if (g.game?.paused === true) g.game.togglePause?.(false);
            // A fresh world auto-starts core's "Welcome to Foundry" tour, whose
            // overlay sits over the middle of every capture: end it if it is up, and
            // neuter its pending delayed start.
            const welcome = g.game?.tours?.get?.('core.welcome');
            if (welcome !== undefined)
                welcome.start = async (): Promise<void> => {
                    await Promise.resolve();
                };
            g.foundry?.nue?.Tour?.activeTour?.exit?.();
            document.querySelectorAll('.tour-overlay, .tour-fadeout, .tour-center-step').forEach((n) => {
                n.remove();
            });
            g.ui?.notifications?.clear?.();
            // A hover tooltip left up by the last click (a move-mode toggle's covered its panel).
            if (keepTooltip !== true) g.game?.tooltip?.deactivate?.();
            // Toasts, and the chat popouts shown over the canvas while the sidebar is collapsed.
            document.querySelectorAll('#notifications > *, #chat-notifications .chat-message').forEach((n) => {
                n.remove();
            });
            if (!closeWindows) return;
            const apps = Array.from(g.foundry?.applications?.instances?.values() ?? []);
            await Promise.all(
                apps
                    // Floating windows mount on <body>; core UI (sidebar, hotbar, controls) lives under #interface.
                    .filter((app) => {
                        const id = app.id ?? '';
                        if (keep !== null && id.includes(keep)) return false;
                        return document.getElementById(id)?.parentElement === document.body;
                    })
                    .map(async (app) => {
                        try {
                            await app.close?.({ animate: false });
                        } catch {
                            /* ignore */
                        }
                    }),
            );
        }, options);
    } catch {
        /* ignore */
    }
}

/**
 * The cheap clear on its own: unpause, end and neuter the welcome tour, hide the
 * hover tooltip and dismiss notifications, leaving every window open. Run once at
 * join so a spec's first click is never intercepted by the tour overlay (a hazards
 * run timed out clicking the scene controls under it).
 */
export async function clearTransientOverlays(page: Page): Promise<void> {
    await clearOverlays(page, { closeWindows: false, keepIdFragment: null });
}

/**
 * The full clear: the cheap pass {@link snap} always runs, plus closing every
 * floating application window whose id does not contain `keepIdFragment` (stray
 * windows such as In-Universe Time overlapped sheets; a sheet's app id embeds its
 * document id).
 */
export async function clearScreenOverlays(page: Page, keepIdFragment?: string): Promise<void> {
    await clearOverlays(page, { closeWindows: true, keepIdFragment: keepIdFragment ?? null });
}

/** Id of the style element {@link withCaptureStyle} mounts for the length of one capture. */
const CAPTURE_STYLE_ID = 'e2e-capture-style';

/** Foundry's shared hover tooltip, and the locked tooltips it can leave pinned. */
const TOOLTIP_HIDE = '#tooltip, .locked-tooltip { display: none !important; }';

/**
 * Mount `css` as a real stylesheet for the length of `run`, so the visibility guard
 * sees the page exactly as the capture will (Playwright's own `style` option only
 * applies inside the screenshot call, after the guard has looked).
 */
async function withCaptureStyle<T>(page: Page, css: string, run: () => Promise<T>): Promise<T> {
    await page.evaluate(
        ({ id, text }: { id: string; text: string }) => {
            document.getElementById(id)?.remove();
            const style = document.createElement('style');
            style.id = id;
            style.textContent = text;
            document.head.appendChild(style);
        },
        { id: CAPTURE_STYLE_ID, text: css },
    );
    try {
        return await run();
    } finally {
        await page.evaluate((id: string) => document.getElementById(id)?.remove(), CAPTURE_STYLE_ID);
    }
}

/**
 * Why `target` would not show as the subject of a capture, or null when it would:
 * it must be in the DOM, have a size, and be the topmost element at its own centre.
 * The capture evidence of #700 failed every one of these silently: a closed dialog
 * fell back to a full-scene shot, and the time widget sat on top of the window named.
 */
async function obstruction(target: Locator): Promise<string | null> {
    if ((await target.count()) === 0) return 'not in the DOM';
    await target.scrollIntoViewIfNeeded().catch(() => undefined);
    return target.evaluate((el: Element) => {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return 'has no size (hidden or collapsed)';
        const x = Math.min(Math.max(rect.left + rect.width / 2, 0), window.innerWidth - 1);
        const y = Math.min(Math.max(rect.top + rect.height / 2, 0), window.innerHeight - 1);
        const top = document.elementFromPoint(x, y);
        if (top === null) return 'is outside the viewport';
        if (top === el || el.contains(top)) return null;
        const owner = top.closest('[id]');
        const name = owner === null ? top.tagName.toLowerCase() : `#${owner.id}`;
        return `is covered at its centre by ${name}`;
    });
}

/** Fail the capture, naming the subject and what is wrong with it. */
async function assertCapturable(target: Locator, what: string, label: string): Promise<void> {
    const problem = await obstruction(target);
    if (problem !== null) throw new Error(`snap('${label}'): the subject ${what} ${problem}, so the screenshot would not show it`);
}

/** Pixels of margin kept around the marked capture hosts. */
const CAPTURE_HOST_MARGIN_PX = 8;

/**
 * The viewport region covering every element marked `data-e2e-capture`, or null
 * when none is mounted. A spec that renders a template into a page-mounted host
 * (rather than an application window) tags the host so the default capture finds
 * it: an unmarked host is invisible to the application picker, which then took
 * whatever window was open, usually a HUD widget.
 */
async function captureHostClip(page: Page): Promise<{ x: number; y: number; width: number; height: number } | null> {
    return page.evaluate((margin: number) => {
        const rects = Array.from(document.querySelectorAll<HTMLElement>('[data-e2e-capture]'))
            .map((el) => el.getBoundingClientRect())
            .filter((r) => r.width > 0 && r.height > 0);
        if (rects.length === 0) return null;
        const left = Math.max(0, Math.min(...rects.map((r) => r.left)) - margin);
        const top = Math.max(0, Math.min(...rects.map((r) => r.top)) - margin);
        const right = Math.min(window.innerWidth, Math.max(...rects.map((r) => r.right)) + margin);
        const bottom = Math.min(window.innerHeight, Math.max(...rects.map((r) => r.bottom)) + margin);
        return { x: left, y: top, width: right - left, height: bottom - top };
    }, CAPTURE_HOST_MARGIN_PX);
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
 *                  for canvas / scene captures). Pass `{ clip }` (viewport
 *                  pixels, see `canvasClip` in canvas-capture.ts) to capture
 *                  one region of the canvas. Default: capture the
 *                  most recently rendered application root.
 *
 *                  Every capture first runs the cheap overlay clear (unpause,
 *                  the welcome tour, notifications). Pass `{ closeWindows: true }`
 *                  to also close the floating windows, keeping the ones whose id
 *                  contains `keepWindow` (the subject's app id).
 */
export async function snap(
    page: Page,
    label: string,
    opts: {
        fullPage?: boolean;
        selector?: string;
        clip?: { x: number; y: number; width: number; height: number };
        closeWindows?: boolean;
        keepWindow?: string;
        /** Keep the hover tooltip up: the capture shows what hovering reveals. */
        keepTooltip?: boolean;
    } = {},
): Promise<string> {
    ensureDir();
    await clearOverlays(page, { closeWindows: opts.closeWindows === true, keepIdFragment: opts.keepWindow ?? null, keepTooltip: opts.keepTooltip === true });

    // Best-effort: derive a spec name from the page's current URL or a
    // generic prefix if no test context is available.
    const specHint = basename(page.url() || 'page').split('?')[0] ?? 'page';
    const key = `${sanitize(specHint)}__${sanitize(label)}`;
    const n = (counters.get(key) ?? 0) + 1;
    counters.set(key, n);
    const suffix = n === 1 ? '' : `-${n}`;
    const path = resolve(SCREENSHOT_DIR, `${key}${suffix}.png`);

    // A hover tooltip re-opens under a pointer still resting on the control a spec
    // last clicked (an attack-mode hint covered a Roll Test dialog's buttons, #701),
    // so the pointer moves off every window before the capture.
    if (opts.keepTooltip !== true) await page.mouse.move(0, 0).catch(() => undefined);
    const tooltipCss = opts.keepTooltip === true ? '' : ` ${TOOLTIP_HIDE}`;

    // Whole page and explicit viewport regions (canvas areas) have no single
    // subject to guard; they capture what is on screen.
    if (opts.fullPage === true || opts.clip !== undefined) {
        const region = opts.fullPage === true ? { fullPage: true } : { clip: opts.clip };
        return withCaptureStyle(page, `${CAPTURE_STYLE}${tooltipCss}`, async () => {
            await page.screenshot({ path, ...region });
            return path;
        });
    }

    // Explicit selector: capture just that element. A selector that matches nothing
    // fails the capture: it used to fall back to whatever window was open.
    if (typeof opts.selector === 'string' && opts.selector !== '') {
        const loc = page.locator(opts.selector).first();
        // The persistent HUD windows are hidden unless the subject is one of them.
        const subjectIsHud =
            (await loc.count()) > 0 &&
            (await loc.evaluate((el: Element, ids: string[]) => ids.some((id) => el.closest(`#${id}`) !== null), PERSISTENT_HUD_IDS));
        const css = `${subjectIsHud ? CAPTURE_STYLE : DEFAULT_CAPTURE_STYLE}${tooltipCss}`;
        return withCaptureStyle(page, css, async () => {
            await assertCapturable(loc, `"${opts.selector ?? ''}"`, label);
            await loc.screenshot({ path });
            return path;
        });
    }

    return withCaptureStyle(page, `${DEFAULT_CAPTURE_STYLE}${tooltipCss}`, async () => {
        // A page-mounted template host the spec marked for capture.
        const hostClip = await captureHostClip(page);
        if (hostClip !== null) {
            await page.screenshot({ path, clip: hostClip });
            return path;
        }

        // Default: the most recent application window. With none open there is no
        // subject, and a full-scene shot would only pass for evidence (#700).
        const appLoc = await prepareApplicationForCapture(page);
        if (appLoc === null) throw new Error(`snap('${label}'): no application window is open to capture; pass a selector, clip or fullPage`);
        await assertCapturable(appLoc, 'application window', label);
        await appLoc.screenshot({ path });
        return path;
    });
}
