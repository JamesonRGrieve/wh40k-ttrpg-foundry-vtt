import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Deathwatch Special-Issue Ammunition panel (#172).
 *
 * Renders the Handlebars partial into the deployed Foundry world via
 * the `templates/actor/panel/dw-ammo-panel.hbs` URL with Kraken
 * selected, asserts that:
 *   - the loaded-label round-trips onto the `data-loaded` attribute,
 *   - the eight ammo-id radio options render (one per
 *     `DW_SELECTED_AMMO_CHOICES` entry),
 *   - the selected radio is `checked`,
 *   - the effect block surfaces the +3 Penetration line (Kraken RAW),
 *   - the dwSelectAmmo radios carry the right `data-action`.
 * Mirrors the shape of `dw-renown.spec.ts`.
 */
test.describe.serial('DwSpecialAmmoPanel (Tier B)', () => {
    test('renders eight ammo options with selected radio and effect summary', async ({ page }) => {
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
                const templateUrl = '/systems/wh40k-rpg/templates/actor/panel/dw-ammo-panel.hbs';
                let error: string | null = null;
                let rendered = false;
                let loadedAttr = '';
                let loadedText = '';
                let radioCount = 0;
                let selectedRadioId = '';
                let selectedRadioChecked = false;
                let hasPenetrationLine = false;
                let actionAttr = '';

                try {
                    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-side globals have no shipped types
                    const fg = globalThis as unknown as PanelGlobals;
                    const fetchFn = fg.fetch;
                    if (typeof fetchFn !== 'function') {
                        return {
                            rendered,
                            loadedAttr,
                            loadedText,
                            radioCount,
                            selectedRadioId,
                            selectedRadioChecked,
                            hasPenetrationLine,
                            actionAttr,
                            error: 'fetch not available on globalThis',
                        };
                    }
                    const src = await (await fetchFn(templateUrl)).text();
                    const HandlebarsGlobal = fg.Handlebars;
                    if (HandlebarsGlobal === undefined || typeof HandlebarsGlobal.compile !== 'function') {
                        return {
                            rendered,
                            loadedAttr,
                            loadedText,
                            radioCount,
                            selectedRadioId,
                            selectedRadioChecked,
                            hasPenetrationLine,
                            actionAttr,
                            error: 'Handlebars not available on globalThis',
                        };
                    }
                    const tpl = HandlebarsGlobal.compile(src);
                    // Kraken — RAW +3 Penetration, unconditional. Exercises the
                    // effect-block path and the selected-radio highlight.
                    const options = [
                        { id: 'standard', label: 'Standard', selected: false, summary: 'No engine effect.' },
                        { id: 'hellfire', label: 'Hellfire', selected: false, summary: '+1d10 damage vs. unarmored targets.' },
                        { id: 'kraken', label: 'Kraken', selected: true, summary: '+3 Penetration.' },
                        { id: 'metal-storm', label: 'Metal Storm', selected: false, summary: '+1 hit per DoS.' },
                        { id: 'tempest', label: 'Tempest', selected: false, summary: 'Ignores energy fields.' },
                        { id: 'stalker', label: 'Stalker', selected: false, summary: 'Silent; +10 Stealth.' },
                        { id: 'vengeance', label: 'Vengeance', selected: false, summary: '+2 dmg; -1 Reliability.' },
                        { id: 'dragonfire', label: 'Dragonfire', selected: false, summary: '+1d10 Fire; ignores cover.' },
                    ];
                    const html = tpl({
                        ammoPanel: {
                            selected: 'kraken',
                            selectedLabel: 'Kraken',
                            options,
                            effect: {
                                bonusDamageDice: 0,
                                bonusFlatDamage: 0,
                                bonusPenetration: 3,
                                bonusHitsPerDoS: 0,
                                ignoresCover: false,
                                ignoresEnergyFields: false,
                                reliabilityShift: 0,
                                stealthBonus: 0,
                                fireDamage: false,
                                conditionalUnarmored: false,
                            },
                        },
                    });
                    const host = document.createElement('div');
                    // Tailwind utilities are scoped to .wh40k-rpg via
                    // tailwind.config.js `important: '.wh40k-rpg'`; without an
                    // ancestor with that class every tw-* class is dropped.
                    host.className = 'wh40k-rpg';
                    host.dataset['wh40kSystem'] = 'dw';
                    host.style.position = 'fixed';
                    host.style.top = '40px';
                    host.style.right = '40px';
                    host.style.width = '380px';
                    host.style.zIndex = '99999';
                    host.innerHTML = html;
                    document.body.appendChild(host);
                    rendered = host.firstElementChild instanceof HTMLElement;

                    if (rendered) {
                        const loadedSpan = host.querySelector('.wh40k-dw-ammo-loaded');
                        loadedText = loadedSpan?.textContent.trim() ?? '';
                        loadedAttr = loadedSpan?.getAttribute('data-loaded') ?? '';

                        const radios = host.querySelectorAll<HTMLInputElement>('input.wh40k-dw-ammo-radio');
                        radioCount = radios.length;
                        const selected = host.querySelector<HTMLInputElement>('input.wh40k-dw-ammo-radio[checked]');
                        selectedRadioId = selected?.getAttribute('data-ammo-id') ?? '';
                        selectedRadioChecked = selected !== null;
                        actionAttr = host.querySelector('input.wh40k-dw-ammo-radio')?.getAttribute('data-action') ?? '';

                        hasPenetrationLine = host.querySelector('li.wh40k-dw-ammo-effect-line[data-effect="bonusPenetration"]') !== null;
                    }

                    // Anchor the rendered DOM so snap() captures live pixels.
                    interface DwAmmoHostGlobal {
                        __dwAmmoPanelHost?: HTMLElement | undefined;
                    }
                    // eslint-disable-next-line no-restricted-syntax -- boundary: stashing browser-realm host on globalThis for cross-eval cleanup
                    (globalThis as unknown as DwAmmoHostGlobal).__dwAmmoPanelHost = host;
                } catch (err) {
                    error = String((err as Error).message);
                }

                return {
                    rendered,
                    loadedAttr,
                    loadedText,
                    radioCount,
                    selectedRadioId,
                    selectedRadioChecked,
                    hasPenetrationLine,
                    actionAttr,
                    error,
                };
            });

            await snap(page, 'dw-special-ammo-panel');

            // Tear down so the host doesn't leak into the next serial test.
            await page.evaluate(() => {
                interface DwAmmoHostGlobal {
                    __dwAmmoPanelHost?: HTMLElement | undefined;
                }
                // eslint-disable-next-line no-restricted-syntax -- boundary: reading browser-realm host stashed on globalThis
                const fg = globalThis as unknown as DwAmmoHostGlobal;
                const host = fg.__dwAmmoPanelHost;
                try {
                    host?.remove();
                } catch {
                    /* ignore */
                }
                fg.__dwAmmoPanelHost = undefined;
            });

            expect(result.error, `panel probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'panel did not render').toBe(true);
            expect(result.loadedAttr, 'loaded data attr should be "kraken"').toBe('kraken');
            expect(result.loadedText, 'loaded label should be "Kraken"').toBe('Kraken');
            // Eight radios: 'standard' + the seven Special-Issue ids.
            expect(result.radioCount, 'should render eight ammo radio options').toBe(8);
            expect(result.selectedRadioChecked, 'one radio should be checked').toBe(true);
            expect(result.selectedRadioId, 'checked radio should be "kraken"').toBe('kraken');
            expect(result.actionAttr, 'radio should carry data-action="dwSelectAmmo"').toBe('dwSelectAmmo');
            expect(result.hasPenetrationLine, 'effect block should surface +Penetration line for Kraken').toBe(true);
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('panel.render', 'DwSpecialAmmoPanel');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
