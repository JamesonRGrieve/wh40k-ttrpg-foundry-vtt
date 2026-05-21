import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the DW Squad Mode / Solo Mode panel (#163).
 *
 * Fetches the `templates/actor/panel/dw-mode-panel.hbs` partial from
 * the deployed system URL, renders it with a representative Squad-
 * mode context (Renown rank `respected` → 60 m support range, two
 * sustained abilities), asserts the support-range visual + vocal
 * cells and the sustained-abilities rows render, and snaps the
 * result. Mirrors the bc-alignment-advancement.spec.ts shape: the
 * rendered DOM stays anchored to a globalThis handle so snap()
 * captures live pixels, and is torn down after capture so the next
 * test starts clean.
 */
test.describe.serial('DwSquadModePanel (Tier B)', () => {
    test('renders mode + support range + sustained abilities and snaps', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const pageErrors: string[] = [];
        const listener = (err: Error): void => {
            pageErrors.push(err.message);
        };
        page.on('pageerror', listener);

        try {
            const result = await page.evaluate(async () => {
                interface HandlebarsCompile {
                    compile: (s: string) => (ctx: object) => string;
                }
                interface PanelGlobals {
                    fetch?: (u: string) => Promise<Response>;
                    Handlebars?: HandlebarsCompile;
                }
                const templateUrl = '/systems/wh40k-rpg/templates/actor/panel/dw-mode-panel.hbs';
                let error: string | null = null;
                let rendered = false;
                let mode = '';
                let renownRank = '';
                let visualDistance = '';
                let vocalDistance = '';
                let sustainedRows = 0;
                let hasLeaveButton = false;
                let hasEnterButton = false;

                try {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-side globals have no shipped types
                    const fg = globalThis as unknown as PanelGlobals;
                    const fetchFn = fg.fetch;
                    if (typeof fetchFn !== 'function') {
                        return {
                            rendered,
                            mode,
                            renownRank,
                            visualDistance,
                            vocalDistance,
                            sustainedRows,
                            hasLeaveButton,
                            hasEnterButton,
                            error: 'fetch not available on globalThis',
                        };
                    }
                    const src = await (await fetchFn(templateUrl)).text();
                    const HandlebarsGbl = fg.Handlebars;
                    if (HandlebarsGbl === undefined || typeof HandlebarsGbl.compile !== 'function') {
                        return {
                            rendered,
                            mode,
                            renownRank,
                            visualDistance,
                            vocalDistance,
                            sustainedRows,
                            hasLeaveButton,
                            hasEnterButton,
                            error: 'Handlebars not available on globalThis',
                        };
                    }
                    const tpl = HandlebarsGbl.compile(src);
                    const html = tpl({
                        modePanel: {
                            mode: 'squad',
                            renownRank: 'respected',
                            renownRankKey: 'Respected',
                            supportRange: { visual: 60, vocal: 60 },
                            sustainedAbilities: [
                                { id: 'codex-attack-pattern.long-vigil', label: 'Long Vigil' },
                                { id: 'defensive-stance.bulwark', label: 'Bulwark of the Emperor' },
                            ],
                        },
                    });
                    const host = document.createElement('div');
                    // Tailwind utilities are scoped to .wh40k-rpg via
                    // tailwind.config.js `important: '.wh40k-rpg'`; without
                    // an ancestor with that class every tw-* class is
                    // dropped. The data-wh40k-system attribute anchors the
                    // dw:tw-* per-system variants the panel uses.
                    host.className = 'wh40k-rpg';
                    host.dataset['wh40kSystem'] = 'dw';
                    host.style.position = 'fixed';
                    host.style.top = '40px';
                    host.style.right = '40px';
                    host.style.width = '360px';
                    host.style.zIndex = '99999';
                    host.innerHTML = html;
                    document.body.appendChild(host);
                    rendered = host.firstElementChild instanceof HTMLElement;

                    if (rendered) {
                        const panel = host.querySelector('section.wh40k-dw-mode-panel');
                        mode = panel?.getAttribute('data-dw-combat-mode') ?? '';
                        renownRank = panel?.getAttribute('data-dw-renown-rank') ?? '';
                        visualDistance = host.querySelector('[data-channel="visual"] .wh40k-dw-mode-support-value')?.getAttribute('data-distance') ?? '';
                        vocalDistance = host.querySelector('[data-channel="vocal"] .wh40k-dw-mode-support-value')?.getAttribute('data-distance') ?? '';
                        sustainedRows = host.querySelectorAll('.wh40k-dw-mode-sustained-item').length;
                        hasLeaveButton = host.querySelector('button.wh40k-dw-mode-leave-btn[data-action="dwLeaveSquadMode"]') !== null;
                        hasEnterButton = host.querySelector('button.wh40k-dw-mode-enter-btn[data-action="dwEnterSquadMode"]') !== null;
                    }

                    // Hold the host on a global handle so snap() (called
                    // outside this evaluate) captures the live DOM.
                    interface DwModeHostGlobal {
                        __dwModePanelHost?: HTMLElement | undefined;
                    }
                    // eslint-disable-next-line no-restricted-syntax -- boundary: stashing browser-realm host on globalThis for cross-eval cleanup
                    (globalThis as unknown as DwModeHostGlobal).__dwModePanelHost = host;
                } catch (err) {
                    error = (err as Error).message;
                }

                return {
                    rendered,
                    mode,
                    renownRank,
                    visualDistance,
                    vocalDistance,
                    sustainedRows,
                    hasLeaveButton,
                    hasEnterButton,
                    error,
                };
            });

            await snap(page, 'dw-squad-mode-panel');

            // Panel captured; tear it down so it doesn't leak into the
            // next serial test's DOM.
            await page.evaluate(() => {
                interface DwModeHostGlobal {
                    __dwModePanelHost?: HTMLElement | undefined;
                }
                // eslint-disable-next-line no-restricted-syntax -- boundary: reading browser-realm host stashed on globalThis
                const fg = globalThis as unknown as DwModeHostGlobal;
                const host = fg.__dwModePanelHost;
                try {
                    host?.remove();
                } catch {
                    /* ignore */
                }
                fg.__dwModePanelHost = undefined;
            });

            expect(result.error, `panel probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'panel did not render').toBe(true);
            expect(result.mode, 'data-dw-combat-mode should round-trip').toBe('squad');
            expect(result.renownRank, 'data-dw-renown-rank should round-trip').toBe('respected');
            // Support range table — Renown rank `respected` is 60 m on both channels (Table 7-9).
            expect(result.visualDistance, 'visual support distance should match Table 7-9 for respected (60 m)').toBe('60');
            expect(result.vocalDistance, 'vocal support distance should match Table 7-9 for respected (60 m)').toBe('60');
            expect(result.sustainedRows, 'expected both sustained-ability rows to render').toBe(2);
            expect(result.hasLeaveButton, 'Squad-mode panel should render the Leave button').toBe(true);
            expect(result.hasEnterButton, 'Squad-mode panel should NOT render the Enter button').toBe(false);
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('panel.render', 'DwSquadModePanel');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
