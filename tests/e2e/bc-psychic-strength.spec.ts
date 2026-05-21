import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the BC Psychic Strength panel (#178).
 *
 * Renders the Handlebars partial into the deployed Foundry world via
 * the `templates/actor/panel/bc-psychic-panel.hbs` URL, asserts the
 * core controls (class selector, mode selector, push slider, sustained
 * input) and the three computed readouts (effective PR, phenomena
 * rolls, sustain penalty) render, then snaps the result. Follows the
 * bc-alignment-advancement.spec.ts shape: the rendered DOM stays
 * anchored to a globalThis handle so snap() captures live pixels, and
 * is torn down after capture so the next test starts clean.
 */
test.describe.serial('BcPsychicStrengthPanel (Tier B)', () => {
    test('renders psyker class + mode + push slider + readouts and snaps', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const pageErrors: string[] = [];
        const listener = (err: Error): void => {
            pageErrors.push(err.message);
        };
        page.on('pageerror', listener);

        try {
            const result = await page.evaluate(async () => {
                const templateUrl = '/systems/wh40k-rpg/templates/actor/panel/bc-psychic-panel.hbs';
                let error: string | null = null;
                let rendered = false;
                let hasClassSelect = false;
                let hasModeSelect = false;
                let hasPushSlider = false;
                let hasSustainInput = false;
                let hasTestButton = false;
                let effectivePR = '';
                let phenomenaRolls = '';
                let sustainPenalty = '';
                let psykerClassAttr = '';
                let modeAttr = '';

                try {
                    /* eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `fetch`/`Handlebars` globals are injected by the licensed app; Handlebars compile ctx is opaque */
                    const g = globalThis as unknown as {
                        fetch: (u: string) => Promise<Response>;
                        // eslint-disable-next-line no-restricted-syntax -- boundary: Handlebars compile context is opaque template data
                        Handlebars: { compile: (s: string) => (ctx: unknown) => string };
                    };
                    const src = await (await g.fetch(templateUrl)).text();
                    const HbsLib = g.Handlebars;
                    if (typeof HbsLib.compile !== 'function') {
                        return {
                            rendered,
                            hasClassSelect,
                            hasModeSelect,
                            hasPushSlider,
                            hasSustainInput,
                            hasTestButton,
                            effectivePR,
                            phenomenaRolls,
                            sustainPenalty,
                            psykerClassAttr,
                            modeAttr,
                            error: 'Handlebars not available on globalThis',
                        };
                    }
                    const tpl = HbsLib.compile(src);
                    // Bound psyker, base PR 4, push level 3 (at the
                    // bound ceiling), sustaining 2 powers — exercises
                    // every readout: effectivePR = 4 + 3 = 7,
                    // phenomenaRolls = 1 + 3 = 4, sustainPenalty = -10.
                    const html = tpl({
                        psychicPanel: {
                            psykerClass: 'bound',
                            psyRating: 4,
                            sustainedPowerCount: 2,
                            mode: 'push',
                            pushLevel: 3,
                            maxPushLevel: 3,
                            effectivePR: 7,
                            sustainPenalty: -10,
                            phenomenaRolls: 4,
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
                    host.style.width = '360px';
                    host.style.zIndex = '99999';
                    host.innerHTML = html;
                    document.body.appendChild(host);
                    rendered = host.firstElementChild instanceof HTMLElement;

                    if (rendered) {
                        hasClassSelect = host.querySelector('select.wh40k-bc-psyker-class-select') !== null;
                        hasModeSelect = host.querySelector('select.wh40k-bc-psy-mode-select') !== null;
                        hasPushSlider = host.querySelector('input.wh40k-bc-push-level-input') !== null;
                        hasSustainInput = host.querySelector('input.wh40k-bc-sustain-count-input') !== null;
                        hasTestButton = host.querySelector('button.wh40k-bc-psychic-test-btn[data-action="bcPsychicTest"]') !== null;
                        effectivePR = host.querySelector('.wh40k-bc-psychic-effective')?.getAttribute('data-effective-pr') ?? '';
                        phenomenaRolls = host.querySelector('.wh40k-bc-psychic-phenomena')?.getAttribute('data-phenomena-rolls') ?? '';
                        sustainPenalty = host.querySelector('.wh40k-bc-psychic-sustain-penalty')?.getAttribute('data-sustain-penalty') ?? '';
                        psykerClassAttr = host.querySelector('section.wh40k-bc-psychic-panel')?.getAttribute('data-bc-psyker-class') ?? '';
                        modeAttr = host.querySelector('section.wh40k-bc-psychic-panel')?.getAttribute('data-bc-psy-mode') ?? '';
                    }

                    // Hold the host on a global handle so snap() (called
                    // outside this evaluate) captures the live DOM. Tearing
                    // it down here would leave the screenshot empty.
                    // eslint-disable-next-line no-restricted-syntax -- boundary: stashing a DOM host on globalThis for cross-evaluate cleanup; no shipped types
                    (globalThis as unknown as { __bcPsychicPanelHost: HTMLElement | undefined }).__bcPsychicPanelHost = host;
                } catch (err) {
                    error = err instanceof Error ? err.message : String(err);
                }

                return {
                    rendered,
                    hasClassSelect,
                    hasModeSelect,
                    hasPushSlider,
                    hasSustainInput,
                    hasTestButton,
                    effectivePR,
                    phenomenaRolls,
                    sustainPenalty,
                    psykerClassAttr,
                    modeAttr,
                    error,
                };
            });

            await snap(page, 'bc-psychic-strength-panel');

            // Panel captured; tear it down so it doesn't leak into the next
            // serial test's DOM.
            await page.evaluate(() => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: reading back DOM host stashed on globalThis from the prior evaluate; no shipped types
                const g = globalThis as unknown as { __bcPsychicPanelHost: HTMLElement | undefined };
                try {
                    g.__bcPsychicPanelHost?.remove();
                } catch {
                    /* ignore */
                }
                g.__bcPsychicPanelHost = undefined;
            });

            expect(result.error, `panel probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'panel did not render').toBe(true);
            expect(result.hasClassSelect, 'psyker class selector should render').toBe(true);
            expect(result.hasModeSelect, 'mode selector should render').toBe(true);
            expect(result.hasPushSlider, 'push level slider should render').toBe(true);
            expect(result.hasSustainInput, 'sustained power count input should render').toBe(true);
            expect(result.hasTestButton, 'psychic test button should render').toBe(true);
            expect(result.effectivePR, 'effective PR data attr should round-trip').toBe('7');
            expect(result.phenomenaRolls, 'phenomena rolls data attr should round-trip').toBe('4');
            expect(result.sustainPenalty, 'sustain penalty data attr should round-trip').toBe('-10');
            expect(result.psykerClassAttr, 'psyker class data attr should round-trip').toBe('bound');
            expect(result.modeAttr, 'mode data attr should round-trip').toBe('push');
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('panel.render', 'BcPsychicStrengthPanel');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
