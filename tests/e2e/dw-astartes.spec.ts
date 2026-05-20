import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Deathwatch Astartes baseline panel (#167).
 *
 * Renders the Handlebars partial into the deployed Foundry world via
 * `templates/actor/panel/dw-astartes-panel.hbs`, asserts the 19 implant
 * badges + the Unnatural readouts + the Black Carapace interface banner
 * render, then exercises the Black Carapace toggle (DOM-level — the
 * orchestrator-wired action handler updates the actor, which is out of
 * scope for this Tier B render snap), and snaps the result.
 *
 * Follows the disorder-roll-dialog / bc-alignment-advancement shape:
 * the rendered DOM stays anchored to a globalThis handle so snap()
 * captures live pixels, and is torn down after capture so the next
 * test starts clean.
 */
test.describe.serial('DwAstartesPanel (Tier B)', () => {
    test('renders 19 implant badges + unnatural readouts and toggles Black Carapace', async ({ page }) => {
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
                const templateUrl = '/systems/wh40k-rpg/templates/actor/panel/dw-astartes-panel.hbs';
                let error: string | null = null;
                let rendered = false;
                let implantCount = 0;
                let hasUnnaturalSb = false;
                let hasUnnaturalTb = false;
                let hasBlackCarapaceBanner = false;
                let blackCarapaceInitialPressed = '';
                let blackCarapaceAfterTogglePressed = '';

                const IMPLANT_IDS = [
                    'secondary-heart',
                    'ossmodula',
                    'biscopea',
                    'haemastamen',
                    'larramans-organ',
                    'catalepsean-node',
                    'preomnor',
                    'omophagea',
                    'multi-lung',
                    'occulobe',
                    'lymans-ear',
                    'sus-an-membrane',
                    'melanchromic-organ',
                    'oolitic-kidney',
                    'neuroglottis',
                    'mucranoid',
                    'betchers-gland',
                    'progenoids',
                    'black-carapace',
                ];
                const NAME_KEY: Record<string, string> = {
                    'secondary-heart': 'SecondaryHeart',
                    'ossmodula': 'Ossmodula',
                    'biscopea': 'Biscopea',
                    'haemastamen': 'Haemastamen',
                    'larramans-organ': 'LarramansOrgan',
                    'catalepsean-node': 'CatalepseanNode',
                    'preomnor': 'Preomnor',
                    'omophagea': 'Omophagea',
                    'multi-lung': 'MultiLung',
                    'occulobe': 'Occulobe',
                    'lymans-ear': 'LymansEar',
                    'sus-an-membrane': 'SusAnMembrane',
                    'melanchromic-organ': 'MelanchromicOrgan',
                    'oolitic-kidney': 'OoliticKidney',
                    'neuroglottis': 'Neuroglottis',
                    'mucranoid': 'Mucranoid',
                    'betchers-gland': 'BetchersGland',
                    'progenoids': 'Progenoids',
                    'black-carapace': 'BlackCarapace',
                };

                try {
                    const fetchAny = (globalThis as any).fetch as (u: string) => Promise<Response>;
                    const src = await (await fetchAny(templateUrl)).text();
                    const Handlebars = (globalThis as any).Handlebars as { compile: (s: string) => (ctx: unknown) => string };
                    if (typeof Handlebars?.compile !== 'function') {
                        return {
                            rendered,
                            implantCount,
                            hasUnnaturalSb,
                            hasUnnaturalTb,
                            hasBlackCarapaceBanner,
                            blackCarapaceInitialPressed,
                            blackCarapaceAfterTogglePressed,
                            error: 'Handlebars not available on globalThis',
                        };
                    }
                    const buildCtx = (present: Set<string>) => ({
                        astartesPanel: {
                            implants: IMPLANT_IDS.map((id) => ({
                                id,
                                nameKey: `WH40K.DW.Astartes.Implant.${NAME_KEY[id]}.Name`,
                                categoryKey: 'WH40K.DW.Astartes.Category.Baseline',
                                has: present.has(id),
                            })),
                            strengthBonus: 10,
                            toughnessBonus: 10,
                            hasBlackCarapace: present.has('black-carapace'),
                        },
                    });

                    const tpl = Handlebars.compile(src);

                    // Initial render: full implant set, Black Carapace ON.
                    const fullSet = new Set<string>(IMPLANT_IDS);
                    const html = tpl(buildCtx(fullSet));
                    const host = document.createElement('div');
                    // Tailwind utilities are scoped to .wh40k-rpg via tailwind.config.js
                    // `important: '.wh40k-rpg'`; without an ancestor with that class
                    // every tw-* class is dropped. See CLAUDE.md
                    // "Check the .wh40k-rpg ancestor for ALL tw-* utilities".
                    host.className = 'wh40k-rpg';
                    host.dataset['wh40kSystem'] = 'dw';
                    host.style.position = 'fixed';
                    host.style.top = '40px';
                    host.style.right = '40px';
                    host.style.width = '560px';
                    host.style.zIndex = '99999';
                    host.innerHTML = html;
                    document.body.appendChild(host);
                    rendered = host.firstElementChild instanceof HTMLElement;

                    if (rendered) {
                        implantCount = host.querySelectorAll('button.wh40k-dw-astartes-implant').length;
                        hasUnnaturalSb = host.querySelector('.wh40k-dw-astartes-sb') !== null;
                        hasUnnaturalTb = host.querySelector('.wh40k-dw-astartes-tb') !== null;
                        hasBlackCarapaceBanner = host.querySelector('.wh40k-dw-astartes-bc-banner') !== null;

                        const bcBtn = host.querySelector<HTMLButtonElement>('button[data-implant-id="black-carapace"]');
                        blackCarapaceInitialPressed = bcBtn?.getAttribute('aria-pressed') ?? '';

                        // Toggle Black Carapace off and re-render the partial
                        // to confirm the badge flips state (the action handler
                        // itself is integration-tested via the actor.update
                        // round-trip in unit tests; here we only need to verify
                        // the partial reflects state change correctly).
                        const withoutBc = new Set<string>(IMPLANT_IDS);
                        withoutBc.delete('black-carapace');
                        host.innerHTML = tpl(buildCtx(withoutBc));
                        const bcBtnAfter = host.querySelector<HTMLButtonElement>('button[data-implant-id="black-carapace"]');
                        blackCarapaceAfterTogglePressed = bcBtnAfter?.getAttribute('aria-pressed') ?? '';
                    }

                    // Hold the host on a global handle so snap() (called
                    // outside this evaluate) captures the live DOM.
                    (globalThis as any).__dwAstartesPanelHost = host;
                } catch (err) {
                    error = String((err as Error)?.message ?? err);
                }

                return {
                    rendered,
                    implantCount,
                    hasUnnaturalSb,
                    hasUnnaturalTb,
                    hasBlackCarapaceBanner,
                    blackCarapaceInitialPressed,
                    blackCarapaceAfterTogglePressed,
                    error,
                };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            await snap(page, 'dw-astartes-panel');

            await page.evaluate(() => {
                /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side cleanup */
                const host = (globalThis as any).__dwAstartesPanelHost as HTMLElement | undefined;
                try {
                    host?.remove();
                } catch {
                    /* ignore */
                }
                (globalThis as any).__dwAstartesPanelHost = undefined;
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            expect(result.error, `panel probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'panel did not render').toBe(true);
            expect(result.implantCount, 'expected 19 implant badges').toBe(19);
            expect(result.hasUnnaturalSb, 'Unnatural Strength readout should render').toBe(true);
            expect(result.hasUnnaturalTb, 'Unnatural Toughness readout should render').toBe(true);
            expect(result.hasBlackCarapaceBanner, 'Black Carapace banner should render when implant present').toBe(true);
            expect(result.blackCarapaceInitialPressed, 'Black Carapace badge should start pressed=true').toBe('true');
            expect(result.blackCarapaceAfterTogglePressed, 'Black Carapace badge should flip to pressed=false after toggle').toBe('false');
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('panel.render', 'DwAstartesPanel');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
