import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Critical Damage chat card (GitHub #108 —
 * core.md §"Critical Damage", Tables 7–7 … 7–22).
 *
 * Renders the critical-damage chat card via Foundry's deployed
 * Handlebars runtime, asserts the (damageType × bodyPart × severity)
 * row and its rider pills render, and snaps the live DOM. The card is
 * left mounted under a `.wh40k-rpg` ancestor so snap() (called outside
 * the evaluate) captures it; it is torn down afterward.
 */

test.describe.serial('CriticalDamageChat (Tier B)', () => {
    test('renders the critical-damage card with effect + rider pills and snaps', async ({ page }) => {
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
                const templatePath = '/systems/wh40k-rpg/templates/chat/critical-damage-chat.hbs';
                let error: string | null = null;
                let rendered = false;
                let hasCardRoot = false;
                let hasSystemAttr = false;
                let hasWh40kAncestor = false;
                let riderPills = 0;
                let hasEffectText = false;

                try {
                    interface FoundryRenderGlobals {
                        foundry?: {
                            applications?: {
                                handlebars?: {
                                    renderTemplate?: (path: string, ctx: object) => Promise<string>;
                                };
                            };
                        };
                    }
                    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry browser-side globals have no shipped types
                    const g = globalThis as unknown as FoundryRenderGlobals;
                    const renderTemplateFn = g.foundry?.applications?.handlebars?.renderTemplate;
                    if (typeof renderTemplateFn !== 'function') {
                        return {
                            rendered,
                            hasCardRoot,
                            hasSystemAttr,
                            hasWh40kAncestor,
                            riderPills,
                            hasEffectText,
                            error: 'renderTemplate unavailable',
                        };
                    }

                    const ctx = {
                        gameSystem: 'dh2e',
                        damageTypeKey: 'WH40K.CriticalDamage.DamageType.Energy',
                        bodyPartKey: 'WH40K.CriticalDamage.BodyPart.Arm',
                        severityLabel: '5',
                        effect: 'Energy courses through the arm. He is Stunned for 1 round, and the arm is Useless until the target receives medical treatment.',
                        riderLabels: ['WH40K.CriticalDamage.Rider.Stunned', 'WH40K.CriticalDamage.Rider.LostLimb'],
                    };

                    let html = '';
                    try {
                        html = await renderTemplateFn(templatePath, ctx);
                    } catch (renderErr) {
                        error = String((renderErr as Error).message);
                    }

                    if (html) {
                        // Mount under a .wh40k-rpg ancestor so Tailwind utility
                        // scoping (important: '.wh40k-rpg') cascades exactly as
                        // it would on a chat message (CLAUDE.md Gotcha 3a).
                        const host = document.createElement('div');
                        host.id = '__c9critdmg';
                        host.className = 'wh40k-rpg';
                        host.style.position = 'fixed';
                        host.style.top = '40px';
                        host.style.left = '40px';
                        host.style.width = '420px';
                        host.style.zIndex = '99999';
                        host.innerHTML = html;
                        document.body.appendChild(host);

                        const card = host.querySelector('.wh40k-critdmg-card');
                        rendered = card instanceof HTMLElement;
                        hasCardRoot = card !== null;
                        hasSystemAttr = card?.getAttribute('data-wh40k-system') === 'dh2e';
                        hasWh40kAncestor = card?.closest('.wh40k-rpg') !== null;
                        riderPills = host.querySelectorAll('.wh40k-critdmg-card span.tw-rounded-full').length;
                        hasEffectText = (card?.textContent ?? '').includes('Stunned for 1 round');
                    }
                } catch (outerErr) {
                    error = String((outerErr as Error).message);
                }

                return {
                    rendered,
                    hasCardRoot,
                    hasSystemAttr,
                    hasWh40kAncestor,
                    riderPills,
                    hasEffectText,
                    error,
                };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            await snap(page, 'critical-damage-chat');

            // Card captured; tear it down so it doesn't leak into the
            // next serial test's DOM.
            await page.evaluate(() => {
                document.getElementById('__c9critdmg')?.remove();
            });

            expect(result.error, `card probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'card did not render').toBe(true);
            expect(result.hasCardRoot, 'card root should render').toBe(true);
            expect(result.hasSystemAttr, 'data-wh40k-system should be dh2e').toBe(true);
            expect(result.hasWh40kAncestor, 'card needs a .wh40k-rpg ancestor for Tailwind').toBe(true);
            expect(result.hasEffectText, 'effect prose should render in the card').toBe(true);
            expect(result.riderPills, 'expected two rider pills (Stunned + Lost Limb)').toBe(2);
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('chat.card-render', 'CriticalDamageChat');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
