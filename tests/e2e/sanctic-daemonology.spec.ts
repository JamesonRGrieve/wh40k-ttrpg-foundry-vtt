import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Sanctic Daemonology discipline (GitHub #130 —
 * beyond.md L1813–2090).
 *
 * Drives the deployed `sanctic-daemonology` rules module to resolve a
 * pushed manifestation, renders the manifestation chat card via
 * Foundry's runtime `renderTemplate`, injects it into a live
 * `.wh40k-rpg` host that stays in the DOM while `snap()` runs, and
 * asserts the discipline's defining contrast: a successful Sanctic
 * power inflicts NO corruption while still firing Phenomena on a push.
 */

test.describe.serial('SancticDaemonology (Tier B)', () => {
    test('renders the manifestation card with zero corruption and snaps', async ({ page }) => {
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
                const g = globalThis as any;
                let error: string | null = null;
                let rendered = false;
                let corruption: number | null = null;
                let phenomenaFires = false;
                let canFateNegate = false;
                let hasSystemAttr = false;
                let hasWh40kClass = false;

                try {
                    const moduleUrl = '/systems/wh40k-rpg/module/rules/sanctic-daemonology.js';
                    const mod = await import(moduleUrl);
                    const resolve = mod.resolveSancticManifestation as
                        | ((input: unknown) => {
                              power: { name: string };
                              effectivePR: number;
                              focusModifier: number;
                              corruption: number;
                              phenomenaFires: boolean;
                              phenomenaModifier: number;
                              canSoulBindIgnore: boolean;
                              canFateNegate: boolean;
                          })
                        | undefined;
                    if (typeof resolve !== 'function') {
                        return {
                            rendered,
                            corruption,
                            phenomenaFires,
                            canFateNegate,
                            hasSystemAttr,
                            hasWh40kClass,
                            error: 'resolveSancticManifestation export missing',
                        };
                    }

                    const r = resolve({
                        powerId: 'cleansing-flame',
                        mode: 'push',
                        basePR: 4,
                        pushLevel: 2,
                        success: true,
                        mitigation: { emperorsAnathema: true },
                    });
                    corruption = r.corruption;
                    phenomenaFires = r.phenomenaFires;
                    canFateNegate = r.canFateNegate;

                    const renderTemplateFn = g.foundry?.applications?.handlebars?.renderTemplate as
                        | ((path: string, ctx: object) => Promise<string>)
                        | undefined;
                    if (typeof renderTemplateFn !== 'function') {
                        return {
                            rendered,
                            corruption,
                            phenomenaFires,
                            canFateNegate,
                            hasSystemAttr,
                            hasWh40kClass,
                            error: 'renderTemplate API unavailable',
                        };
                    }

                    const html = await renderTemplateFn('systems/wh40k-rpg/templates/chat/sanctic-daemonology-chat.hbs', {
                        gameSystem: 'dh2e',
                        powerName: r.power.name,
                        modeKey: 'WH40K.SancticDaemonology.Mode.Push',
                        effectivePR: r.effectivePR,
                        focusModifier: r.focusModifier >= 0 ? `+${r.focusModifier}` : `${r.focusModifier}`,
                        phenomenaFires: r.phenomenaFires,
                        phenomenaModifier: r.phenomenaModifier,
                        canSoulBindIgnore: r.canSoulBindIgnore,
                        canFateNegate: r.canFateNegate,
                    });

                    // Inject into a persistent host so snap() (called
                    // outside this evaluate) captures the live card.
                    // Closing/removing here would leave the shot empty.
                    let host = document.getElementById('__c9_sd_host');
                    if (!host) {
                        host = document.createElement('div');
                        host.id = '__c9_sd_host';
                        host.className = 'wh40k-rpg';
                        host.style.cssText = 'position:fixed;top:40px;left:40px;width:420px;z-index:100000;';
                        document.body.appendChild(host);
                    }
                    host.innerHTML = html;

                    const card = host.querySelector('.wh40k-sd-card');
                    rendered = card instanceof HTMLElement;
                    if (rendered && card) {
                        hasSystemAttr = card.getAttribute('data-wh40k-system') === 'dh2e';
                        // The card root sits under the `.wh40k-rpg` host so
                        // the important-scoped Tailwind utilities cascade.
                        hasWh40kClass = card.closest('.wh40k-rpg') !== null;
                    }
                } catch (err) {
                    error = String(err instanceof Error ? err.message : err);
                }

                return {
                    rendered,
                    corruption,
                    phenomenaFires,
                    canFateNegate,
                    hasSystemAttr,
                    hasWh40kClass,
                    error,
                };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            await snap(page, 'sanctic-daemonology');

            // Card captured; tear down the host so it doesn't leak into
            // the next serial test's DOM.
            await page.evaluate(() => {
                document.getElementById('__c9_sd_host')?.remove();
            });

            expect(result.error, `sanctic probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'sanctic chat card did not render').toBe(true);
            // The defining contrast: Sanctic never inflicts corruption.
            expect(result.corruption, 'Sanctic manifestation must cost 0 corruption').toBe(0);
            // A pushed success still forces a Phenomena draw.
            expect(result.phenomenaFires, 'pushed Sanctic success should fire Phenomena').toBe(true);
            // Emperor's Anathema (#131) mitigation surfaces on the card.
            expect(result.canFateNegate, "Emperor's Anathema Fate-negation should be offered").toBe(true);
            // Outside-sheet cascade + per-system anchors are present.
            expect(result.hasSystemAttr, 'card should carry data-wh40k-system').toBe(true);
            expect(result.hasWh40kClass, 'card should sit under a .wh40k-rpg ancestor').toBe(true);
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('chat.render', 'SancticDaemonology');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
