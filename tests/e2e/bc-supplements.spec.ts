import { recordCoverage } from './lib/coverage-tracker';
import { countHooks, expectHooks } from './lib/hooks';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the BC Supplement Mechanics panel (#181).
 *
 * Renders the Handlebars partial into the deployed Foundry world via
 * the `templates/actor/panel/bc-supplements-panel.hbs` URL, asserts the
 * daemon engine rating input renders alongside the computed rage bonus,
 * then snaps the result. Follows the bc-psychic-strength.spec.ts shape:
 * the rendered DOM stays anchored to a globalThis handle so snap()
 * captures live pixels, and is torn down after capture so the next test
 * starts clean.
 */
test.describe.serial('BcSupplementMechanicsPanel (Tier B)', () => {
    test('renders daemon engine rating + rage readout and snaps', async ({ page }) => {
        await joinOrSkip(page);

        const result = await page.evaluate(async () => {
            const templateUrl = '/systems/wh40k-rpg/templates/actor/panel/bc-supplements-panel.hbs';
            let error: string | null = null;
            let rendered = false;
            let hasDaemonEngineInput = false;
            let rageBonus = '';
            let daemonEngineRatingAttr = '';

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
                    return { rendered, hasDaemonEngineInput, rageBonus, daemonEngineRatingAttr, error: 'Handlebars not available on globalThis' };
                }
                const tpl = HbsLib.compile(src);
                // Daemon Engine(3) idle 2 turns → rage = 3 + min(2,3) = 5.
                const html = tpl({
                    supplementsPanel: {
                        daemonEngineRating: 3,
                        daemonEngineActive: true,
                        turnsSinceLastDamage: 2,
                        daemonEngineRageBonus: 5,
                    },
                });
                // A .wh40k-rpg host (Tailwind is scoped to it) painted with the sheet window surface.
                const host = globalThis.wh40kE2E.panelHost({ html, system: 'bc', width: 360 });
                rendered = host.firstElementChild instanceof HTMLElement;

                if (rendered) {
                    hasDaemonEngineInput = host.querySelector('input[data-wh40k-hook="bc-daemon-engine-rating-input"]') !== null;
                    rageBonus = host.querySelector('[data-wh40k-hook="bc-daemon-engine-rage"]')?.getAttribute('data-rage-bonus') ?? '';
                    daemonEngineRatingAttr = host.querySelector('section.wh40k-bc-supplements-panel')?.getAttribute('data-bc-daemon-engine-rating') ?? '';
                }

                // Hold the host on a global handle so snap() (called
                // outside this evaluate) captures the live DOM. Tearing
                // it down here would leave the screenshot empty.
                // eslint-disable-next-line no-restricted-syntax -- boundary: stashing a DOM host on globalThis for cross-evaluate cleanup; no shipped types
                (globalThis as unknown as { __bcSupplementsPanelHost: HTMLElement | undefined }).__bcSupplementsPanelHost = host;
            } catch (err) {
                error = String(err instanceof Error ? err.message : err);
            }

            return { rendered, hasDaemonEngineInput, rageBonus, daemonEngineRatingAttr, error };
        });

        const hookCounts = await countHooks(page);

        await snap(page, 'bc-supplements-panel');

        // Panel captured; tear it down so it doesn't leak into the
        // next serial test's DOM.
        await page.evaluate(() => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: reading back DOM host stashed on globalThis from the prior evaluate; no shipped types
            const g = globalThis as unknown as { __bcSupplementsPanelHost: HTMLElement | undefined };
            try {
                g.__bcSupplementsPanelHost?.remove();
            } catch {
                /* ignore */
            }
            g.__bcSupplementsPanelHost = undefined;
        });

        expect(result.error, `panel probe error: ${result.error ?? ''}`).toBeNull();
        expect(result.rendered, 'panel did not render').toBe(true);
        expectHooks(hookCounts, ['bc-daemon-engine-rating-input', 'bc-daemon-engine-rage']);
        expect(result.hasDaemonEngineInput, 'daemon engine rating input should render').toBe(true);
        expect(result.rageBonus, 'rage bonus data attr should round-trip').toBe('5');
        expect(result.daemonEngineRatingAttr, 'daemon engine rating data attr should round-trip').toBe('3');

        recordCoverage('panel.render', 'BcSupplementMechanicsPanel');
    });
});
