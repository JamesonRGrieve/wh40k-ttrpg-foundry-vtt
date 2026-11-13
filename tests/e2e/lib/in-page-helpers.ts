import type { Page } from '@playwright/test';
import { E2E_OP_TIMEOUT_MS, E2E_TIMEOUT_SCALE } from './timing';

/** Default poll interval for {@link E2EPageHelpers.waitFor}. */
const WAIT_FOR_POLL_MS = 50;

/**
 * Timing and text-layout helpers for code running inside `page.evaluate`, which
 * cannot import Node-side modules. Installed once per page by
 * {@link installInPageHelpers}; every budget is derived from the Node-side
 * `E2E_TIMEOUT_SCALE` (see timing.ts).
 */
interface E2EPageHelpers {
    /** Default budget for one in-page operation (scaled 5000 ms). */
    readonly opTimeoutMs: number;
    /** Scale a base budget (ms) by `E2E_TIMEOUT_SCALE`. */
    readonly scaledMs: (baseMs: number) => number;
    /**
     * Race `promise` against a timer. Rejects with `${label} timed out after ${ms}ms`
     * when the timer wins, so one hung document/socket call fails its own flow
     * instead of burning the whole test budget.
     */
    readonly withTimeout: <T>(promise: PromiseLike<T>, label: string, ms?: number) => Promise<T>;
    /**
     * Poll `predicate` every `pollMs` until it returns true. Rejects with
     * `${label} not satisfied after ${ms}ms` when the budget runs out.
     */
    readonly waitFor: (predicate: () => boolean | Promise<boolean>, label: string, ms?: number, pollMs?: number) => Promise<void>;
    /**
     * Poll `predicate` like {@link waitFor} but resolve to whether it became true
     * instead of rejecting — for a probe that waits for a side effect and then
     * records the observed (possibly still wrong) state as its own result.
     */
    readonly pollUntil: (predicate: () => boolean | Promise<boolean>, ms?: number, pollMs?: number) => Promise<boolean>;
    /**
     * Sleep for a scaled settle delay. Only for letting a render settle before a
     * screenshot or a render-only probe — never as a wait for a side effect that
     * an assertion then checks (use {@link waitFor} for that).
     */
    readonly settle: (baseMs: number) => Promise<void>;
    /**
     * How many lines `el`'s own text occupies: distinct line tops among the rects of
     * its direct text nodes (a button's icon sits at another top, so it is skipped).
     * A label or button that must not wrap reads 1.
     */
    readonly textLines: (el: Element) => number;
    /** Every word under `root` drawn across more than one line (a mid-word break). */
    readonly splitWords: (root: Element) => string[];
    /**
     * Mount a rendered panel/card template in a fixed `.wh40k-rpg` host for a capture,
     * painted with the sheet window surface (`--wh40k-window-surface`), so the panel reads
     * as it does on a real sheet instead of translucent over the scene canvas (#701).
     * With `id`, an existing host of that id is reused.
     */
    readonly panelHost: (opts: PanelHostOptions) => HTMLElement;
    /**
     * The UUID of the one compendium document of `type` named `name` in a game
     * line's packs (`wh40k-rpg.<line>-…`) for `documentName`. Specs find content
     * this way instead of naming a pack id, which the public tree must not carry.
     * Rejects when there is no such document.
     */
    readonly compendiumUuid: (ref: CompendiumRef) => Promise<string>;
}

/** A compendium document named by game line, document class, type and name. */
interface CompendiumRef {
    readonly line: string;
    readonly documentName: string;
    readonly type: string;
    readonly name: string;
}

/** The slice of a Foundry compendium pack {@link E2EPageHelpers.compendiumUuid} reads. */
interface PackLike {
    readonly documentName: string;
    readonly metadata: { readonly id: string };
    readonly getIndex: (options: { fields: string[] }) => Promise<Iterable<{ name: string; type?: string; uuid: string }>>;
}

/** Placement and markup for {@link E2EPageHelpers.panelHost}. */
interface PanelHostOptions {
    /** The rendered template's HTML. */
    readonly html: string;
    /** Host width in px. */
    readonly width: number;
    /** `data-wh40k-system` for per-line variants. */
    readonly system?: string;
    /** The screen edge the host sits 40px from (default right). */
    readonly side?: 'left' | 'right';
    /** Reuse (or create with) this element id. */
    readonly id?: string;
    /** Mark the host `data-e2e-capture` (default true). */
    readonly capture?: boolean;
    readonly zIndex?: number;
}

declare global {
    /** In-page timing helpers, installed per page by {@link installInPageHelpers}. */
    // eslint-disable-next-line no-var -- a global installed at runtime must be declared with `var` to land on globalThis
    var wh40kE2E: E2EPageHelpers;
}

/**
 * Install `globalThis.wh40kE2E` on every document the page loads. An init script
 * because `page.evaluate` bodies cannot close over Node-side helpers; the scale and
 * default budget are passed in from timing.ts so the page uses the same values.
 * @param {Page} page  The spec's page.
 * @returns {Promise<void>}
 */
export async function installInPageHelpers(page: Page): Promise<void> {
    await page.addInitScript(
        ({ opTimeoutMs, timeoutScale, defaultPollMs }) => {
            const scaledMs = (baseMs: number): number => Math.round(baseMs * timeoutScale);
            const sleepMs = async (ms: number): Promise<void> => {
                await new Promise<void>((r) => {
                    window.setTimeout(r, ms);
                });
            };
            const pollUntil = async (predicate: () => boolean | Promise<boolean>, ms = opTimeoutMs, pollMs = defaultPollMs): Promise<boolean> => {
                const deadline = Date.now() + ms;
                while (!(await predicate())) {
                    if (Date.now() >= deadline) return false;
                    await sleepMs(pollMs);
                }
                return true;
            };
            globalThis.wh40kE2E = {
                opTimeoutMs,
                scaledMs,
                withTimeout: async <T>(promise: PromiseLike<T>, label: string, ms = opTimeoutMs): Promise<T> => {
                    const timer = { id: 0 };
                    const timeout = new Promise<never>((_, reject) => {
                        timer.id = window.setTimeout(() => {
                            reject(new Error(`${label} timed out after ${ms}ms`));
                        }, ms);
                    });
                    try {
                        return await Promise.race([promise, timeout]);
                    } finally {
                        window.clearTimeout(timer.id);
                    }
                },
                waitFor: async (predicate, label, ms = opTimeoutMs, pollMs = defaultPollMs): Promise<void> => {
                    if (!(await pollUntil(predicate, ms, pollMs))) throw new Error(`${label} not satisfied after ${ms}ms`);
                },
                pollUntil,
                settle: async (baseMs: number): Promise<void> => {
                    await sleepMs(scaledMs(baseMs));
                },
                textLines: (el: Element): number => {
                    const tops = new Set<number>();
                    for (const node of Array.from(el.childNodes)) {
                        if (node.nodeType !== Node.TEXT_NODE || (node.textContent ?? '').trim() === '') continue;
                        const range = document.createRange();
                        range.selectNodeContents(node);
                        for (const rect of Array.from(range.getClientRects())) if (rect.width > 0) tops.add(Math.round(rect.top));
                    }
                    return tops.size;
                },
                splitWords: (root: Element): string[] => {
                    const split: string[] = [];
                    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
                    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
                        for (const match of (node.textContent ?? '').matchAll(/\S+/gu)) {
                            const range = document.createRange();
                            range.setStart(node, match.index);
                            range.setEnd(node, match.index + match[0].length);
                            const tops = new Set(
                                Array.from(range.getClientRects())
                                    .filter((rect) => rect.width > 0)
                                    .map((rect) => Math.round(rect.top)),
                            );
                            if (tops.size > 1) split.push(match[0]);
                        }
                    }
                    return split;
                },
                panelHost: (opts: PanelHostOptions): HTMLElement => {
                    const existing = opts.id === undefined ? null : document.getElementById(opts.id);
                    const host = existing ?? document.createElement('div');
                    if (opts.id !== undefined) host.id = opts.id;
                    host.className = 'wh40k-rpg';
                    if (opts.capture !== false) host.dataset['e2eCapture'] = '';
                    if (opts.system !== undefined) host.dataset['wh40kSystem'] = opts.system;
                    host.style.position = 'fixed';
                    host.style.top = '40px';
                    host.style[opts.side ?? 'right'] = '40px';
                    host.style.width = `${opts.width}px`;
                    host.style.zIndex = String(opts.zIndex ?? 99999);
                    // The window surface a real sheet paints under its panels (#694), so a capture
                    // shows the panel as it reads on a sheet, not over the scene canvas (#701).
                    host.style.background = 'var(--wh40k-window-surface)';
                    host.innerHTML = opts.html;
                    if (existing === null) document.body.appendChild(host);
                    return host;
                },
                compendiumUuid: async (ref: CompendiumRef): Promise<string> => {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's `game.packs` is injected by the licensed app; no shipped types
                    const packs = (globalThis as unknown as { game: { packs: Iterable<PackLike> } }).game.packs;
                    const prefix = `wh40k-rpg.${ref.line}-`;
                    for (const pack of packs) {
                        if (pack.documentName !== ref.documentName || !pack.metadata.id.startsWith(prefix)) continue;
                        // eslint-disable-next-line no-await-in-loop -- stop at the first pack that holds the document
                        const index = await pack.getIndex({ fields: ['name', 'type'] });
                        for (const entry of index) if (entry.name === ref.name && entry.type === ref.type) return entry.uuid;
                    }
                    throw new Error(`no ${ref.documentName} ${ref.type} named "${ref.name}" in the ${ref.line} packs`);
                },
            };
        },
        { opTimeoutMs: E2E_OP_TIMEOUT_MS, timeoutScale: E2E_TIMEOUT_SCALE, defaultPollMs: WAIT_FOR_POLL_MS },
    );
}
