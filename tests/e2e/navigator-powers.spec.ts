import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Navigator Power chat card (GitHub #194 — RT
 * core.md §"Using Navigator Powers").
 *
 * Renders the navigator-power chat card via Foundry's deployed
 * Handlebars runtime, asserts the (level × roll × opposed) surfaces
 * render correctly with a `.wh40k-rpg` ancestor and the `rt`
 * data-wh40k-system attribute, then snaps the live DOM. The card is
 * left mounted so snap() (called outside the evaluate) captures it;
 * it is torn down afterward.
 */

test.describe.serial('NavigatorPowerChat (Tier B)', () => {
    test('renders the navigator-power card with effect tiers + opposed-test block and snaps', async ({ page }) => {
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
                const templatePath = '/systems/wh40k-rpg/templates/chat/navigator-power-chat.hbs';
                let error: string | null = null;
                let rendered = false;
                let hasCardRoot = false;
                let hasSystemAttr = false;
                let hasWh40kAncestor = false;
                let hasOpposedBlock = false;
                let effectTierItems = 0;
                let hasManifestedText = false;
                let hasNetDosText = false;

                try {
                    const g = globalThis as any;
                    const renderTemplate = g.foundry?.applications?.handlebars?.renderTemplate as
                        | ((path: string, ctx: object) => Promise<string>)
                        | undefined;
                    if (typeof renderTemplate !== 'function') {
                        return {
                            rendered,
                            hasCardRoot,
                            hasSystemAttr,
                            hasWh40kAncestor,
                            hasOpposedBlock,
                            effectTierItems,
                            hasManifestedText,
                            hasNetDosText,
                            error: 'renderTemplate unavailable',
                        };
                    }

                    // Opposed Master Lidless Stare: the most surface-rich
                    // configuration — exercises the badge, opposed block,
                    // additive tier ladder, and sustain clause in one card.
                    const ctx = {
                        item: {
                            name: 'The Lidless Stare',
                            system: {
                                description: { value: '' },
                                sideEffects: '',
                            },
                        },
                        actor: 'Astrianna, Navigator of House Suminaire',
                        gameSystem: 'rt',
                        roll: { total: 12 },
                        targetValue: 75,
                        success: true,
                        degrees: 6,
                        levelLabelKey: 'WH40K.NavigatorPower.Level.Master',
                        levelBonusLabel: '+20',
                        effectTiers: [
                            {
                                level: 'novice',
                                levelLabelKey: 'WH40K.NavigatorPower.Level.Novice',
                                effect: 'Opposed Willpower vs. viewer; 1d10+WPB Energy + Stunned 1 round.',
                            },
                            {
                                level: 'adept',
                                levelLabelKey: 'WH40K.NavigatorPower.Level.Adept',
                                effect: 'Damage 2d10+WPB; Stun 1d5 rounds; +1d5 Insanity.',
                            },
                            {
                                level: 'master',
                                levelLabelKey: 'WH40K.NavigatorPower.Level.Master',
                                effect: 'INT 20+ creatures test Tough(-10) or are slain; pass → 1d10 Insanity.',
                            },
                        ],
                        sustainText: 'No (Full Action; resolves this round).',
                        opposed: {
                            navigatorRoll: 12,
                            navigatorTarget: 75,
                            navigatorDos: 6,
                            opponentRoll: 35,
                            opponentTarget: 40,
                            opponentDos: 1,
                            netDos: 5,
                            success: true,
                        },
                    };

                    let html = '';
                    try {
                        html = await renderTemplate(templatePath, ctx);
                    } catch (err) {
                        error = String((err as Error)?.message ?? err);
                    }

                    if (html) {
                        // Mount under a .wh40k-rpg ancestor so Tailwind utility
                        // scoping (important: '.wh40k-rpg') cascades exactly as
                        // it would on a chat message (CLAUDE.md Gotcha 3a).
                        const host = document.createElement('div');
                        host.id = '__c9navpwr';
                        host.className = 'wh40k-rpg';
                        host.style.position = 'fixed';
                        host.style.top = '40px';
                        host.style.left = '40px';
                        host.style.width = '480px';
                        host.style.zIndex = '99999';
                        host.innerHTML = html;
                        document.body.appendChild(host);

                        const card = host.querySelector('.wh40k-navpwr-card');
                        rendered = card instanceof HTMLElement;
                        hasCardRoot = card !== null;
                        hasSystemAttr = card?.getAttribute('data-wh40k-system') === 'rt';
                        hasWh40kAncestor = card?.closest('.wh40k-rpg') !== null;
                        // The opposed block surfaces NavigatorRoll / OpponentRoll
                        // / NetDoS rows; assert by counting <li> children of the
                        // opposed list (3 rows).
                        const opposedList = card?.querySelector('ul');
                        const lists = card?.querySelectorAll('ul') ?? [];
                        // The first <ul> is the opposed-test breakdown; the
                        // second is the effect-tiers ladder. Count the
                        // effect-tier list's <li> children for the tier count.
                        hasOpposedBlock = (opposedList?.querySelectorAll('li').length ?? 0) >= 3;
                        if (lists.length >= 2) {
                            effectTierItems = lists[1]?.querySelectorAll('li').length ?? 0;
                        }
                        hasManifestedText = (card?.textContent ?? '').includes('NavigatorPower.Manifested') ||
                            (card?.textContent ?? '').toLowerCase().includes('manifested');
                        hasNetDosText = (card?.textContent ?? '').includes('NetDoS') ||
                            (card?.textContent ?? '').toLowerCase().includes('net');
                    }
                } catch (err) {
                    error = String((err as Error)?.message ?? err);
                }

                return {
                    rendered,
                    hasCardRoot,
                    hasSystemAttr,
                    hasWh40kAncestor,
                    hasOpposedBlock,
                    effectTierItems,
                    hasManifestedText,
                    hasNetDosText,
                    error,
                };
                /* eslint-enable @typescript-eslint/no-explicit-any */
            });

            await snap(page, 'navigator-power-chat');

            // Card captured; tear it down so it doesn't leak into the
            // next serial test's DOM.
            await page.evaluate(() => {
                document.getElementById('__c9navpwr')?.remove();
            });

            expect(result.error, `card probe error: ${result.error ?? ''}`).toBeNull();
            expect(result.rendered, 'card did not render').toBe(true);
            expect(result.hasCardRoot, 'card root should render').toBe(true);
            expect(result.hasSystemAttr, 'data-wh40k-system should be rt').toBe(true);
            expect(result.hasWh40kAncestor, 'card needs a .wh40k-rpg ancestor for Tailwind').toBe(true);
            expect(result.hasOpposedBlock, 'opposed-test block should render three rows').toBe(true);
            expect(result.effectTierItems, 'expected three effect-tier list items (Master = additive ladder)').toBe(3);
            expect(pageErrors, `page errors: ${pageErrors.slice(0, 5).join(' | ')}`).toEqual([]);

            recordCoverage('chat.card-render', 'NavigatorPowerChat');
        } finally {
            page.off('pageerror', listener);
        }
    });
});
