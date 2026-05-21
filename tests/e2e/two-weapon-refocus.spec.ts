import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Two-Weapon Wielder errata p. 132 refocus
 * (GitHub #147 — errata/errata.md L67).
 *
 * Drives the deployed `two-weapon-fighting` rules module to resolve a
 * ranged single-shot refocus plan, renders the refocus chat card via
 * Foundry's runtime `renderTemplate`, injects it into a live
 * `.wh40k-rpg` host that stays in the DOM while `snap()` runs, and
 * asserts the errata's defining structure: the dual attack fires a
 * Half-Action Standard Attack ×2 (single shot) — NOT a Full-Action
 * lump or Semi-Auto-Burst ×2 — with the off-hand follow-up as a Free
 * Action following the same restrictions.
 */

test.describe.serial('TwoWeaponRefocus (Tier B)', () => {
    test('renders the ranged single-shot ×2 refocus card and snaps', async ({ page }) => {
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
                let granted = false;
                let attackCount = 0;
                let actionNames: string[] = [];
                let actionCosts: string[] = [];
                let hasSystemAttr = false;
                let hasWh40kClass = false;

                try {
                    const moduleUrl = '/systems/wh40k-rpg/module/rules/two-weapon-fighting.js';
                    const mod = await import(moduleUrl);
                    const resolve = mod.resolveTwoWeaponRefocus as
                        | ((ctx: unknown) => {
                              granted: boolean;
                              attacks: ReadonlyArray<{ hand: string; actionName: string; actionCost: string; modifier: number }>;
                              aimAppliesToOffHand: boolean;
                          })
                        | undefined;
                    if (typeof resolve !== 'function') {
                        return {
                            rendered,
                            granted,
                            attackCount,
                            actionNames,
                            actionCosts,
                            hasSystemAttr,
                            hasWh40kClass,
                            error: 'resolveTwoWeaponRefocus export missing',
                        };
                    }

                    const plan = resolve({
                        isMelee: false,
                        mode: 'Standard Attack',
                        talents: new Set(['Two-Weapon Wielder (Ranged)']),
                    });
                    granted = plan.granted;
                    attackCount = plan.attacks.length;
                    actionNames = plan.attacks.map((a) => a.actionName);
                    actionCosts = plan.attacks.map((a) => a.actionCost);

                    const renderTpl = g.foundry?.applications?.handlebars?.renderTemplate as ((path: string, ctx: object) => Promise<string>) | undefined;
                    if (typeof renderTpl !== 'function') {
                        return {
                            rendered,
                            granted,
                            attackCount,
                            actionNames,
                            actionCosts,
                            hasSystemAttr,
                            hasWh40kClass,
                            error: 'renderTemplate API unavailable',
                        };
                    }

                    const html = await renderTpl('systems/wh40k-rpg/templates/chat/two-weapon-refocus-chat.hbs', {
                        gameSystem: 'dh2e',
                        granted: plan.granted,
                        attacks: plan.attacks,
                    });

                    // Inject into a persistent host so snap() (called
                    // outside this evaluate) captures the live card.
                    // Removing it here would leave the shot empty.
                    let host = document.getElementById('__c9_twr_host');
                    if (!host) {
                        host = document.createElement('div');
                        host.id = '__c9_twr_host';
                        host.className = 'wh40k-rpg';
                        host.style.cssText = 'position:fixed;top:40px;left:40px;width:420px;z-index:100000;';
                        document.body.appendChild(host);
                    }
                    host.innerHTML = html;

                    const card = host.querySelector('.wh40k-twr-card');
                    rendered = card instanceof HTMLElement;
                    if (rendered && card) {
                        hasSystemAttr = card.getAttribute('data-wh40k-system') === 'dh2e';
                        // The card root sits under the `.wh40k-rpg` host so
                        // the important-scoped Tailwind utilities cascade.
                        hasWh40kClass = card.closest('.wh40k-rpg') !== null;
                    }
                } catch (err) {
                    error = err instanceof Error ? err.message : String(err);
                }

                return {
                    rendered,
                    granted,
                    attackCount,
                    actionNames,
                    actionCosts,
                    hasSystemAttr,
                    hasWh40kClass,
                    error,
                };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            await snap(page, 'two-weapon-refocus');

            // Card captured; tear down the host so it doesn't leak into
            // the next serial test's DOM.
            await page.evaluate(() => {
                document.getElementById('__c9_twr_host')?.remove();
            });

            expect(result.error, `two-weapon refocus probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'two-weapon refocus chat card did not render').toBe(true);
            // The errata grants the Free-Action follow-up.
            expect(result.granted, 'ranged Wielder should be granted the refocus follow-up').toBe(true);
            // Two attacks: the Half-Action opener + the Free-Action follow-up.
            expect(result.attackCount, 'refocus plan should hold exactly two attacks').toBe(2);
            // Both are Standard Attacks — NOT a Full-Action lump, NOT
            // Semi-Auto-Burst ×2.
            expect(result.actionNames, 'both attacks must be Standard Attack (single shot ×2)').toEqual(['Standard Attack', 'Standard Attack']);
            // Action economy: Half opener + Free follow-up, never Full.
            expect(result.actionCosts, 'opener is a Half Action; follow-up is a Free Action').toEqual(['Half', 'Free']);
            expect(result.actionCosts.includes('Full'), 'no Full-Action lump in the refocus plan').toBe(false);
            // Outside-sheet cascade + per-system anchors are present.
            expect(result.hasSystemAttr, 'card should carry data-wh40k-system').toBe(true);
            expect(result.hasWh40kClass, 'card should sit under a .wh40k-rpg ancestor').toBe(true);
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('chat.render', 'TwoWeaponRefocus');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
