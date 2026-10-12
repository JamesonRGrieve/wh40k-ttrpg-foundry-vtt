import { recordCoverage } from './lib/coverage-tracker';
import { countHooks, expectHooks } from './lib/hooks';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B coverage of the Deathwatch Distinctions panel (#171).
 *
 * Renders the Handlebars partial into the deployed Foundry world via
 * `templates/actor/panel/dw-distinction-panel.hbs` with one owned special
 * ability per category (one of them below its Renown rank, one Mark carrying a
 * characteristic change and a trait) and asserts each row's category, Renown
 * gate, reward and XP cost render, plus the merged Mark readout. Each row opens
 * its item through the shared `itemEdit` action, which is exercised elsewhere.
 *
 * Follows the dw-astartes / bc-alignment shape: the rendered DOM stays
 * anchored to a globalThis handle so snap() captures live pixels, and is torn
 * down after capture so the next test starts clean.
 */
test.describe.serial('DwDistinctionPanel (Tier B)', () => {
    test('renders owned special abilities with category, Renown gate, reward, cost and merged Mark effects', async ({ page }) => {
        await joinOrSkip(page);

        const result = await page.evaluate(async () => {
            const templateUrl = '/systems/wh40k-rpg/templates/actor/panel/dw-distinction-panel.hbs';
            let error: string | null = null;
            let rendered = false;
            let entryCount = 0;
            let categoryLabels: string[] = [];
            let rankCount = 0;
            let rewardCount = 0;
            let costCount = 0;
            let lockedCount = 0;
            let mergedCharBadgeCount = 0;
            let mergedTraitBadgeCount = 0;

            const ctx = {
                distinctionPanel: {
                    abilities: [
                        {
                            id: 'spec1',
                            name: 'Enhance Healing',
                            category: 'speciality',
                            categoryLabel: 'Speciality Ability',
                            renownRequired: '',
                            renownReward: 0,
                            cost: 0,
                            rankTooLow: false,
                        },
                        {
                            id: 'adv1',
                            name: 'Command and Control',
                            category: 'advanced',
                            categoryLabel: 'Advanced Special Ability',
                            renownRequired: 'Famed',
                            renownReward: 0,
                            cost: 0,
                            rankTooLow: true,
                        },
                        {
                            id: 'dist1',
                            name: 'Tyrannic War Veteran',
                            category: 'distinction',
                            categoryLabel: 'Distinction',
                            renownRequired: '',
                            renownReward: 5,
                            cost: 1100,
                            rankTooLow: false,
                        },
                        {
                            id: 'mark1',
                            name: 'Watcher',
                            category: 'mark',
                            categoryLabel: 'Mark of Distinction',
                            renownRequired: 'Respected',
                            renownReward: 0,
                            cost: 500,
                            rankTooLow: false,
                        },
                    ],
                    merged: {
                        characteristicDelta: [{ key: 'perception', value: 10, displayValue: '+10' }],
                        traits: ['Resistance (Fear)'],
                    },
                },
            };

            try {
                /* eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `fetch`/`Handlebars` globals are injected by the licensed app; Handlebars compile ctx is opaque */
                const g = globalThis as unknown as {
                    fetch: (u: string) => Promise<Response>;
                    Handlebars: { compile: (s: string) => (context: typeof ctx) => string };
                };
                const src = await (await g.fetch(templateUrl)).text();
                const tpl = g.Handlebars.compile(src);

                const host = document.createElement('div');
                // Tailwind utilities are scoped to .wh40k-rpg (tailwind.config.js `important`).
                host.className = 'wh40k-rpg';
                host.dataset['wh40kSystem'] = 'dw';
                host.style.position = 'fixed';
                host.style.top = '40px';
                host.style.right = '40px';
                host.style.width = '560px';
                host.style.zIndex = '99999';
                host.innerHTML = tpl(ctx);
                document.body.appendChild(host);
                rendered = host.firstElementChild instanceof HTMLElement;

                if (rendered) {
                    entryCount = host.querySelectorAll('button[data-wh40k-hook="dw-distinction-entry"][data-action="itemEdit"]').length;
                    categoryLabels = Array.from(host.querySelectorAll('[data-wh40k-hook="dw-distinction-category"]')).map((el) => el.textContent.trim());
                    rankCount = host.querySelectorAll('[data-wh40k-hook="dw-distinction-rank"]').length;
                    rewardCount = host.querySelectorAll('[data-wh40k-hook="dw-distinction-reward"]').length;
                    costCount = host.querySelectorAll('[data-wh40k-hook="dw-distinction-cost"]').length;
                    lockedCount = host.querySelectorAll('[data-wh40k-hook="dw-distinction-locked"]').length;
                    mergedCharBadgeCount = host.querySelectorAll('[data-wh40k-hook="dw-distinction-merged-char"]').length;
                    mergedTraitBadgeCount = host.querySelectorAll('[data-wh40k-hook="dw-distinction-merged-trait"]').length;
                }

                // eslint-disable-next-line no-restricted-syntax -- boundary: stashing a DOM host on globalThis for cross-evaluate cleanup; no shipped types
                (globalThis as unknown as { __dwDistinctionPanelHost: HTMLElement | undefined }).__dwDistinctionPanelHost = host;
            } catch (err) {
                error = String((err as Error).message);
            }

            return { rendered, entryCount, categoryLabels, rankCount, rewardCount, costCount, lockedCount, mergedCharBadgeCount, mergedTraitBadgeCount, error };
        });

        const hookCounts = await countHooks(page);

        await snap(page, 'dw-distinction-panel');

        await page.evaluate(() => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: reading back DOM host stashed on globalThis from the prior evaluate; no shipped types
            const g = globalThis as unknown as { __dwDistinctionPanelHost: HTMLElement | undefined };
            g.__dwDistinctionPanelHost?.remove();
            g.__dwDistinctionPanelHost = undefined;
        });

        expect(result.error, `panel probe error: ${result.error ?? ''}`).toBeNull();
        expect(result.rendered, 'panel did not render').toBe(true);
        expectHooks(hookCounts, [
            'dw-distinction-entry',
            'dw-distinction-category',
            'dw-distinction-rank',
            'dw-distinction-reward',
            'dw-distinction-cost',
            'dw-distinction-locked',
            'dw-distinction-merged',
            'dw-distinction-merged-char',
            'dw-distinction-merged-trait',
        ]);
        expect(result.entryCount, 'one item-opening row per owned special ability').toBe(4);
        expect(result.categoryLabels).toEqual(['Speciality Ability', 'Advanced Special Ability', 'Distinction', 'Mark of Distinction']);
        expect(result.rankCount, 'only abilities with a printed Renown rank show one').toBe(2);
        expect(result.rewardCount, 'only abilities with a Renown reward show one').toBe(1);
        expect(result.costCount, 'only abilities with an XP cost show one').toBe(2);
        expect(result.lockedCount, 'the below-rank ability is marked locked').toBe(1);
        expect(result.mergedCharBadgeCount, 'merged characteristic badge count').toBe(1);
        expect(result.mergedTraitBadgeCount, 'merged trait badge count').toBe(1);

        recordCoverage('panel.render', 'DwDistinctionPanel');
    });
});
