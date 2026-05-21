import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the BC Gifts of the Gods panel (#180).
 *
 * Renders the Handlebars partial into the deployed Foundry world via the
 * `templates/actor/panel/bc-gifts-panel.hbs` URL with a hand-built
 * context that drives every visible branch (multi-gift list, rider tag,
 * sub-table label, per-gift delta chips, merged delta footer). Follows
 * the bc-alignment-advancement.spec.ts shape — the rendered DOM stays
 * anchored to a globalThis handle so snap() captures the live pixels,
 * and is torn down after capture so the next serial test starts clean.
 */
test.describe.serial('BcGiftsPanel (Tier B)', () => {
    test('renders gift list with riders, deltas, and merged-delta footer and snaps', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const pageErrors: string[] = [];
        const listener = (err: Error): void => {
            pageErrors.push(err.message);
        };
        page.on('pageerror', listener);

        try {
            const result = await page.evaluate(async () => {
                /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side probe: Foundry globals are runtime-only */
                const templateUrl = '/systems/wh40k-rpg/templates/actor/panel/bc-gifts-panel.hbs';
                let error: string | null = null;
                let rendered = false;
                let giftEntries = 0;
                let hasMergedFooter = false;
                let firstGiftRider = '';
                let mergedDeltaCount = 0;
                let currentAlignment = '';
                let hasDeltaChips = false;
                let hasSubTable = false;

                try {
                    const fetchAny = (globalThis as any).fetch as (u: string) => Promise<Response>;
                    const src = await (await fetchAny(templateUrl)).text();
                    const HandlebarsInstance = (globalThis as any).Handlebars as { compile: (s: string) => (ctx: unknown) => string };
                    if (typeof HandlebarsInstance?.compile !== 'function') {
                        return {
                            rendered,
                            giftEntries,
                            hasMergedFooter,
                            firstGiftRider,
                            mergedDeltaCount,
                            currentAlignment,
                            hasDeltaChips,
                            hasSubTable,
                            error: 'Handlebars not available on globalThis',
                        };
                    }
                    const tpl = HandlebarsInstance.compile(src);
                    const html = tpl({
                        giftsPanel: {
                            currentAlignment: 'khorne',
                            gifts: [
                                {
                                    id: 'bestial_aspect',
                                    name: 'Bestial Aspect',
                                    baseDescription: 'A feral, monstrous mien — beasts cower.',
                                    riderDescription: 'Khorne marks the bearer: rage incarnate; +5 WS.',
                                    appliedAlignment: 'khorne',
                                    subTableLabel: '',
                                    characteristicDelta: [
                                        { key: 's', value: 5 },
                                        { key: 'ws', value: 5 },
                                    ],
                                    traits: [],
                                    activeEffects: [],
                                },
                                {
                                    id: 'additional_limb',
                                    name: 'Additional Limb',
                                    baseDescription: 'A new limb sprouts.',
                                    riderDescription: 'A chitinous bone-blade arm; +5 S.',
                                    appliedAlignment: 'khorne',
                                    subTableLabel: 'Additional Limb',
                                    characteristicDelta: [
                                        { key: 'ag', value: 3 },
                                        { key: 's', value: 5 },
                                    ],
                                    traits: [],
                                    activeEffects: [],
                                },
                            ],
                            mergedDelta: [
                                { key: 's', value: 10 },
                                { key: 'ws', value: 5 },
                                { key: 'ag', value: 3 },
                            ],
                        },
                    });

                    const host = document.createElement('div');
                    // Tailwind utilities are scoped to .wh40k-rpg via tailwind.config.js
                    // `important: '.wh40k-rpg'`; without an ancestor with that class
                    // every tw-* class is dropped. See CLAUDE.md
                    // "Check the .wh40k-rpg ancestor for ALL tw-* utilities".
                    host.className = 'wh40k-rpg';
                    host.dataset['wh40kSystem'] = 'bc';
                    host.style.position = 'fixed';
                    host.style.top = '40px';
                    host.style.right = '40px';
                    host.style.width = '400px';
                    host.style.zIndex = '99999';
                    host.innerHTML = html;
                    document.body.appendChild(host);
                    rendered = host.firstElementChild instanceof HTMLElement;

                    if (rendered) {
                        giftEntries = host.querySelectorAll('.wh40k-bc-gift-entry').length;
                        hasMergedFooter = host.querySelector('.wh40k-bc-gifts-merged') !== null;
                        firstGiftRider = host.querySelector('.wh40k-bc-gift-entry')?.getAttribute('data-applied-alignment') ?? '';
                        mergedDeltaCount = host.querySelectorAll('.wh40k-bc-gifts-merged-delta').length;
                        currentAlignment = host.querySelector('section.wh40k-bc-gifts-panel')?.getAttribute('data-bc-current-alignment') ?? '';
                        hasDeltaChips = host.querySelectorAll('.wh40k-bc-gift-delta').length > 0;
                        hasSubTable = host.querySelector('.wh40k-bc-gift-subtable') !== null;
                    }

                    // Hold the host on a global handle so snap() (called
                    // outside this evaluate) captures the live DOM. Tearing
                    // it down here would leave the screenshot empty.
                    (globalThis as any).__bcGiftsPanelHost = host;
                } catch (err) {
                    error = String((err as Error)?.message ?? err);
                }

                return {
                    rendered,
                    giftEntries,
                    hasMergedFooter,
                    firstGiftRider,
                    mergedDeltaCount,
                    currentAlignment,
                    hasDeltaChips,
                    hasSubTable,
                    error,
                };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            await snap(page, 'bc-gifts-panel');

            // Panel captured; tear it down so it doesn't leak into the next
            // serial test's DOM.
            await page.evaluate(() => {
                /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side cleanup */
                const host = (globalThis as any).__bcGiftsPanelHost as HTMLElement | undefined;
                try {
                    host?.remove();
                } catch {
                    /* ignore */
                }
                (globalThis as any).__bcGiftsPanelHost = undefined;
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            expect(result.error, `panel probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'panel did not render').toBe(true);
            expect(result.giftEntries, 'expected two gift entries').toBe(2);
            expect(result.hasMergedFooter, 'merged-delta footer should render when any deltas present').toBe(true);
            expect(result.firstGiftRider, 'first gift should report Khorne as applied alignment').toBe('khorne');
            expect(result.mergedDeltaCount, 'merged delta should expose three keys (s, ws, ag)').toBe(3);
            expect(result.currentAlignment, 'current-alignment data attr should round-trip').toBe('khorne');
            expect(result.hasDeltaChips, 'per-gift delta chips should render').toBe(true);
            expect(result.hasSubTable, 'sub-table label should render when the gift carries one').toBe(true);
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('panel.render', 'BcGiftsPanel');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
