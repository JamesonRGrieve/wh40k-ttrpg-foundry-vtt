import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the BC Chaos Ritual panel (#179).
 *
 * Renders the Handlebars partial into the deployed Foundry world via
 * the `templates/actor/panel/bc-ritual-panel.hbs` URL, asserts the
 * Daemonic Mastery input + Perform Ritual button render, then snaps the
 * result. Mirrors the bc-psychic-strength.spec.ts shape: the rendered
 * DOM stays anchored to a globalThis handle so snap() captures live
 * pixels, and is torn down after capture so the next test starts clean.
 */
test.describe.serial('BcChaosRitualPanel (Tier B)', () => {
    test('renders Daemonic Mastery readout + Perform Ritual button and snaps', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const pageErrors: string[] = [];
        const listener = (err: Error): void => {
            pageErrors.push(err.message);
        };
        page.on('pageerror', listener);

        try {
            const result = await page.evaluate(async () => {
                const templateUrl = '/systems/wh40k-rpg/templates/actor/panel/bc-ritual-panel.hbs';
                let error: string | null = null;
                let rendered = false;
                let hasMasteryInput = false;
                let hasPerformButton = false;
                let masteryAttr = '';
                let masteryValue = '';

                try {
                    interface HandlebarsCompile {
                        compile: (s: string) => (ctx: object) => string;
                    }
                    interface BcRitualGlobals {
                        fetch?: (u: string) => Promise<Response>;
                        Handlebars?: HandlebarsCompile;
                    }
                    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-side globals have no shipped types
                    const fg = globalThis as unknown as BcRitualGlobals;
                    const fetchFn = fg.fetch;
                    if (typeof fetchFn !== 'function') {
                        return {
                            rendered,
                            hasMasteryInput,
                            hasPerformButton,
                            masteryAttr,
                            masteryValue,
                            error: 'fetch not available on globalThis',
                        };
                    }
                    const src = await (await fetchFn(templateUrl)).text();
                    const HBS = fg.Handlebars;
                    if (HBS === undefined || typeof HBS.compile !== 'function') {
                        return {
                            rendered,
                            hasMasteryInput,
                            hasPerformButton,
                            masteryAttr,
                            masteryValue,
                            error: 'Handlebars not available on globalThis',
                        };
                    }
                    const tpl = HBS.compile(src);
                    const html = tpl({ ritualPanel: { ritualMastery: 5 } });
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
                    host.style.width = '360px';
                    host.style.zIndex = '99999';
                    host.innerHTML = html;
                    document.body.appendChild(host);
                    rendered = host.firstElementChild instanceof HTMLElement;

                    if (rendered) {
                        hasMasteryInput = host.querySelector('input.wh40k-bc-ritual-mastery-input') !== null;
                        hasPerformButton = host.querySelector('button.wh40k-bc-ritual-perform-btn[data-action="bcPerformRitual"]') !== null;
                        masteryAttr = host.querySelector('section.wh40k-bc-ritual-panel')?.getAttribute('data-bc-ritual-mastery') ?? '';
                        masteryValue = host.querySelector<HTMLInputElement>('input.wh40k-bc-ritual-mastery-input')?.value ?? '';
                    }

                    interface BcRitualHostGlobal {
                        __bcRitualPanelHost?: HTMLElement | undefined;
                    }
                    // eslint-disable-next-line no-restricted-syntax -- boundary: stashing browser-realm host on globalThis for cross-eval cleanup
                    (globalThis as unknown as BcRitualHostGlobal).__bcRitualPanelHost = host;
                } catch (err) {
                    error = err instanceof Error ? err.message : String(err);
                }

                return {
                    rendered,
                    hasMasteryInput,
                    hasPerformButton,
                    masteryAttr,
                    masteryValue,
                    error,
                };
            });

            await snap(page, 'bc-chaos-ritual-panel');

            await page.evaluate(() => {
                interface BcRitualHostGlobal {
                    __bcRitualPanelHost?: HTMLElement | undefined;
                }
                // eslint-disable-next-line no-restricted-syntax -- boundary: reading browser-realm host stashed on globalThis
                const fg = globalThis as unknown as BcRitualHostGlobal;
                const host = fg.__bcRitualPanelHost;
                try {
                    host?.remove();
                } catch {
                    /* ignore */
                }
                fg.__bcRitualPanelHost = undefined;
            });

            expect(result.error, `panel probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'panel did not render').toBe(true);
            expect(result.hasMasteryInput, 'Daemonic Mastery input should render').toBe(true);
            expect(result.hasPerformButton, 'Perform Ritual button should render').toBe(true);
            expect(result.masteryAttr, 'mastery data attribute should round-trip').toBe('5');
            expect(result.masteryValue, 'mastery input value should round-trip').toBe('5');
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('panel.render', 'BcChaosRitualPanel');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
