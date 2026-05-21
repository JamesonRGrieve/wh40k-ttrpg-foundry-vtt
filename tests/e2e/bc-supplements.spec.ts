import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the BC Supplement Mechanics panel (#181).
 *
 * Renders the Handlebars partial into the deployed Foundry world via
 * the `templates/actor/panel/bc-supplements-panel.hbs` URL, asserts the
 * core controls (daemon engine rating input + Quick & the Dead toggle)
 * render alongside the computed readouts (rage bonus, alignment bonus,
 * post-bonus initiative), then snaps the result. Follows the
 * bc-psychic-strength.spec.ts shape: the rendered DOM stays anchored to
 * a globalThis handle so snap() captures live pixels, and is torn down
 * after capture so the next test starts clean.
 */
test.describe.serial('BcSupplementMechanicsPanel (Tier B)', () => {
    test('renders daemon engine rating + Quick & the Dead toggle + readouts and snaps', async ({ page }) => {
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
                const templateUrl = '/systems/wh40k-rpg/templates/actor/panel/bc-supplements-panel.hbs';
                let error: string | null = null;
                let rendered = false;
                let hasDaemonEngineInput = false;
                let hasQuickToggle = false;
                let rageBonus = '';
                let alignmentBonus = '';
                let initiative = '';
                let daemonEngineRatingAttr = '';
                let quickActiveAttr = '';

                try {
                    const fetchAny = (globalThis as any).fetch as (u: string) => Promise<Response>;
                    const src = await (await fetchAny(templateUrl)).text();
                    const HbsLib = (globalThis as any).Handlebars as { compile: (s: string) => (ctx: unknown) => string };
                    if (typeof HbsLib?.compile !== 'function') {
                        return {
                            rendered,
                            hasDaemonEngineInput,
                            hasQuickToggle,
                            rageBonus,
                            alignmentBonus,
                            initiative,
                            daemonEngineRatingAttr,
                            quickActiveAttr,
                            error: 'Handlebars not available on globalThis',
                        };
                    }
                    const tpl = HbsLib.compile(src);
                    // Daemon Engine(3) idle 2 turns → rage = 3 + min(2,3) = 5.
                    // Khorne + Quick & the Dead active → +10 → init 35 → 45.
                    const html = tpl({
                        supplementsPanel: {
                            daemonEngineRating: 3,
                            daemonEngineActive: true,
                            turnsSinceLastDamage: 2,
                            daemonEngineRageBonus: 5,
                            quickAndTheDeadActive: true,
                            chaosAlignment: 'khorne',
                            baseInitiative: 35,
                            quickAndTheDeadBonus: 10,
                            quickAndTheDeadInitiative: 45,
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
                        hasDaemonEngineInput = host.querySelector('input.wh40k-bc-daemon-engine-rating-input') !== null;
                        hasQuickToggle = host.querySelector('button.wh40k-bc-quick-and-the-dead-toggle[data-action="bcToggleQuickAndTheDead"]') !== null;
                        rageBonus = host.querySelector('.wh40k-bc-daemon-engine-rage')?.getAttribute('data-rage-bonus') ?? '';
                        alignmentBonus = host.querySelector('.wh40k-bc-quick-and-the-dead-bonus')?.getAttribute('data-alignment-bonus') ?? '';
                        initiative = host.querySelector('.wh40k-bc-quick-and-the-dead-initiative')?.getAttribute('data-initiative') ?? '';
                        daemonEngineRatingAttr = host.querySelector('section.wh40k-bc-supplements-panel')?.getAttribute('data-bc-daemon-engine-rating') ?? '';
                        quickActiveAttr = host.querySelector('section.wh40k-bc-supplements-panel')?.getAttribute('data-bc-quick-and-the-dead-active') ?? '';
                    }

                    // Hold the host on a global handle so snap() (called
                    // outside this evaluate) captures the live DOM. Tearing
                    // it down here would leave the screenshot empty.
                    (globalThis as any).__bcSupplementsPanelHost = host;
                } catch (err) {
                    error = String((err as Error)?.message ?? err);
                }

                return {
                    rendered,
                    hasDaemonEngineInput,
                    hasQuickToggle,
                    rageBonus,
                    alignmentBonus,
                    initiative,
                    daemonEngineRatingAttr,
                    quickActiveAttr,
                    error,
                };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            await snap(page, 'bc-supplements-panel');

            // Panel captured; tear it down so it doesn't leak into the
            // next serial test's DOM.
            await page.evaluate(() => {
                /* eslint-disable @typescript-eslint/no-explicit-any -- browser-side cleanup */
                const host = (globalThis as any).__bcSupplementsPanelHost as HTMLElement | undefined;
                try {
                    host?.remove();
                } catch {
                    /* ignore */
                }
                (globalThis as any).__bcSupplementsPanelHost = undefined;
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            expect(result.error, `panel probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'panel did not render').toBe(true);
            expect(result.hasDaemonEngineInput, 'daemon engine rating input should render').toBe(true);
            expect(result.hasQuickToggle, 'Quick & the Dead toggle should render').toBe(true);
            expect(result.rageBonus, 'rage bonus data attr should round-trip').toBe('5');
            expect(result.alignmentBonus, 'alignment bonus data attr should round-trip').toBe('10');
            expect(result.initiative, 'initiative data attr should round-trip').toBe('45');
            expect(result.daemonEngineRatingAttr, 'daemon engine rating data attr should round-trip').toBe('3');
            expect(result.quickActiveAttr, 'quick & the dead active data attr should round-trip').toBe('true');
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('panel.render', 'BcSupplementMechanicsPanel');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
