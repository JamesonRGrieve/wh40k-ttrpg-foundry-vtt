import type { Page } from '@playwright/test';
import { awaitCard, cardHtml, deleteDocuments, messageIds, openActorSheet, prepareStage, startCombat } from './combat-resolution-flow';
import { installAttackHarness, leanWeapon } from './lib/attack-harness';
import { popOutChatMessage } from './lib/chat-capture';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { compendiumUuid } from './lib/pack-lookup';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B — Only War Comrades in Combat (#152), in a running
 * combat on a live scene:
 *
 * - Cohesion breaks when the Comrade is moved past 5 m: the panel says so, the
 *   Comrade can no longer follow, and Ranged Volley would grant nothing.
 * - The PC fails a Pinning test, and its Comrade fails with it: the test's card
 *   states it, the Comrade is pinned (no Orders), and a recovery Order clears it.
 * - The PC gives Ranged Volley (the Comrade spends a Half Action); the PC's next
 *   Lasgun attack carries "+5 Ranged Volley" as a sourced row on its BS card.
 *
 * Each step records a `ow-comrade.flow` coverage key; keep OW_COMRADE_FLOWS in sync
 * with the denominator in scripts/e2e-coverage.mjs.
 */

const OW_COMRADE_FLOWS = ['cohesion-broken', 'pinning-mirrored', 'recovery-order', 'ranged-volley-bs-card'] as const;

/** Only War's M36 Lasgun. */
const OW_LASGUN = compendiumUuid({ line: 'ow', category: 'weapons' }, 'dwNgc34I7JMm8HuZ');

const COMRADE_PANEL = '[data-wh40k-hook="ow-comrade-panel"]';
const ORDERS_PANEL = '.wh40k-ow-orders-panel';

/** The PC's Comrade, as stored. */
async function comradeOf(page: Page, actorId: string): Promise<{ distanceM: number; pinned: boolean; fleeing: boolean; halvesSpent: number } | null> {
    return page.evaluate((id) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
        const g = globalThis as unknown as {
            game: {
                actors: {
                    get: (
                        i: string,
                    ) => { system: { comrade: { distanceM: number; pinned: boolean; fleeing: boolean; turn: { halvesSpent: number } } } } | undefined;
                };
            };
        };
        const comrade = g.game.actors.get(id)?.system.comrade;
        return comrade === undefined
            ? null
            : { distanceM: comrade.distanceM, pinned: comrade.pinned, fleeing: comrade.fleeing, halvesSpent: comrade.turn.halvesSpent };
    }, actorId);
}

/** Feed Foundry's dice these d100 faces in order (then restore the RNG once they are drawn). */
async function fixD100(page: Page, faces: number[]): Promise<void> {
    await page.evaluate((queue) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `CONFIG.Dice` has no browser-side types
        const dice = (globalThis as unknown as { CONFIG: { Dice: { randomUniform: () => number } } }).CONFIG.Dice;
        const original = dice.randomUniform;
        const pending = [...queue];
        dice.randomUniform = (): number => {
            const face = pending.shift();
            if (pending.length === 0) dice.randomUniform = original;
            return face === undefined ? original() : 1 - (face - 0.5) / 100;
        };
    }, faces);
}

test.describe.serial('Only War Comrades in Combat (Tier B, #152)', () => {
    test('Cohesion breaks, the Comrade fails Pinning with its PC, and Ranged Volley shows on the BS card', async ({ page }) => {
        await joinOrSkip(page);
        await prepareStage(page);
        await installAttackHarness(page);
        const scene = await page.evaluate(
            async (lasgun: object) =>
                globalThis.wh40kAttack.setup({
                    width: 1200,
                    height: 800,
                    tokens: [
                        {
                            key: 'pc',
                            name: 'Trooper Halden',
                            type: 'ow-character',
                            x: 200,
                            y: 300,
                            items: [lasgun],
                            system: {
                                gameSystem: 'ow',
                                characteristics: { ballisticSkill: { base: 40 }, willpower: { base: 30 } },
                                comrade: { name: 'Comrade Jaeger', state: 'unharmed', distanceM: 3, hasVisualLine: true },
                            },
                        },
                        { key: 'enemy', name: 'Traitor Guardsman', type: 'dh2-npc', x: 800, y: 300 },
                    ],
                }),
            leanWeapon('Lasgun', OW_LASGUN, 30),
        );
        const pcId = scene.actors['pc'] ?? '';
        const enemyId = scene.actors['enemy'] ?? '';
        const combatId = await startCombat(page, scene.sceneId, [
            { actorId: pcId, initiative: 20 },
            { actorId: enemyId, initiative: 10 },
        ]);
        try {
            // In Cohesion at 3 m: the Comrade can follow.
            const sheet = await openActorSheet(page, pcId, 'overview');
            const panel = page.locator(`#${sheet} ${COMRADE_PANEL}`);
            await panel.scrollIntoViewIfNeeded();
            await expect(panel.locator('[data-cohesion]')).toHaveAttribute('data-cohesion', 'in');
            await expect(page.locator(`#${sheet} ${ORDERS_PANEL} button[data-order-id="follow"]`)).toBeVisible();

            // Cohesion breaks: the Comrade is moved 8 m away.
            await panel.locator('input[name="system.comrade.distanceM"]').fill('8');
            await panel.locator('input[name="system.comrade.distanceM"]').press('Tab');
            await expect.poll(async () => (await comradeOf(page, pcId))?.distanceM).toBe(8);
            await expect(page.locator(`#${sheet} ${COMRADE_PANEL} [data-cohesion]`)).toHaveAttribute('data-cohesion', 'out');
            const orders = page.locator(`#${sheet} ${ORDERS_PANEL}`);
            await expect(orders.locator('button[data-order-id="follow"]')).toHaveCount(0);
            await expect(orders.locator('li[data-order-id="follow"] [data-order-block]')).toContainText('only follow you while in Cohesion');
            await expect(orders.locator('li[data-order-id="ranged-volley"] [data-order-no-benefit]')).toBeVisible();
            expect(await snap(page, 'ow-comrade-cohesion-broken', { selector: `#${sheet} ${COMRADE_PANEL}` })).not.toBeNull();
            // The two Orders Cohesion changes: following is blocked, Ranged Volley grants nothing.
            for (const [id, label] of [
                ['follow', 'ow-comrade-follow-blocked'],
                ['ranged-volley', 'ow-comrade-volley-no-benefit'],
            ] as const) {
                const row = `#${sheet} ${ORDERS_PANEL} li[data-order-id="${id}"]`;
                // eslint-disable-next-line no-await-in-loop -- each row scrolled into view and captured in turn
                await page.locator(row).scrollIntoViewIfNeeded();
                // eslint-disable-next-line no-await-in-loop -- see above
                expect(await snap(page, label, { selector: row })).not.toBeNull();
            }
            recordCoverage('ow-comrade.flow', 'cohesion-broken');

            // Back in Cohesion for the rest.
            await page.locator(`#${sheet} ${COMRADE_PANEL} input[name="system.comrade.distanceM"]`).fill('3');
            await page.locator(`#${sheet} ${COMRADE_PANEL} input[name="system.comrade.distanceM"]`).press('Tab');
            await expect.poll(async () => (await comradeOf(page, pcId))?.distanceM).toBe(3);

            // The PC fails a Pinning test (99 against WP 30): the Comrade fails with it.
            let before = await messageIds(page);
            await page.evaluate((id) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
                const g = globalThis as unknown as { game: { actors: { get: (i: string) => { rollPinningTest: () => void } | undefined } } };
                g.game.actors.get(id)?.rollPinningTest();
            }, pcId);
            const dialog = page.locator('form.unified-roll-dialog').last();
            await expect(dialog).toBeVisible();
            await fixD100(page, [99]);
            await dialog.locator('[data-action="systemRoll"]').click();
            await expect.poll(async () => (await comradeOf(page, pcId))?.pinned, { message: 'the Comrade is pinned with its PC' }).toBe(true);
            const pinningCard = await awaitCard(page, before, 'takes no Actions until a recovery Order');
            expect(await cardHtml(page, pinningCard.id)).toContain('Comrade Jaeger');
            const pinningPopout = await popOutChatMessage(page, pinningCard.id);
            expect(await snap(page, 'ow-comrade-pinning-mirrored-card', { selector: pinningPopout })).not.toBeNull();
            const pinnedSheet = await openActorSheet(page, pcId, 'overview');
            await expect(page.locator(`#${pinnedSheet} ${COMRADE_PANEL} [data-comrade-status="pinned"]`)).toBeVisible();
            await expect(page.locator(`#${pinnedSheet} ${ORDERS_PANEL} button[data-action="owIssueOrder"]`)).toHaveCount(0);
            await page.locator(`#${pinnedSheet} ${COMRADE_PANEL}`).scrollIntoViewIfNeeded();
            expect(await snap(page, 'ow-comrade-pinned-panel', { selector: `#${pinnedSheet} ${COMRADE_PANEL}` })).not.toBeNull();
            recordCoverage('ow-comrade.flow', 'pinning-mirrored');

            // A recovery Order clears it.
            before = await messageIds(page);
            await page.locator(`#${pinnedSheet} ${COMRADE_PANEL} button[data-action="owComradeRecover"]`).click();
            await expect.poll(async () => (await comradeOf(page, pcId))?.pinned).toBe(false);
            await awaitCard(page, before, 'data-comrade-recovered');
            recordCoverage('ow-comrade.flow', 'recovery-order');

            // Ranged Volley: the Comrade spends a Half Action, and the PC's Lasgun attack gains +5 BS.
            before = await messageIds(page);
            const volleySheet = await openActorSheet(page, pcId, 'overview');
            await page.locator(`#${volleySheet} ${ORDERS_PANEL} button[data-order-id="ranged-volley"]`).click();
            await expect.poll(async () => (await comradeOf(page, pcId))?.halvesSpent).toBe(1);
            const orderCard = await awaitCard(page, before, 'data-order-outcome="enacted"');
            const orderPopout = await popOutChatMessage(page, orderCard.id);
            expect(await snap(page, 'ow-comrade-ranged-volley-order', { selector: orderPopout })).not.toBeNull();

            const attack = await page.evaluate(
                async (tokens) => globalThis.wh40kAttack.attack({ firer: tokens.pc, target: tokens.enemy, weaponName: 'Lasgun', faces: [[30, 100]] }),
                { pc: scene.tokens['pc'] ?? '', enemy: scene.tokens['enemy'] ?? '' },
            );
            expect(attack.notices.filter((notice) => notice.startsWith('error'))).toEqual([]);
            let attackCardId = '';
            for (const id of attack.messageIds) {
                // eslint-disable-next-line no-await-in-loop -- the attack posts few cards; read each in turn
                if ((await cardHtml(page, id)).includes('Ranged Volley')) attackCardId = id;
            }
            expect(attackCardId, 'the attack card carries the Ranged Volley row').not.toBe('');
            const html = await cardHtml(page, attackCardId);
            expect(html).toContain('Comrade Jaeger');
            expect(html).toMatch(/\+5/);
            const attackPopout = await popOutChatMessage(page, attackCardId);
            expect(await snap(page, 'ow-comrade-ranged-volley-bs-card', { selector: attackPopout })).not.toBeNull();
            recordCoverage('ow-comrade.flow', 'ranged-volley-bs-card');
            expect(OW_COMRADE_FLOWS).toHaveLength(4);
        } finally {
            await deleteDocuments(page, { combats: [combatId] });
            await page.evaluate(async () => globalThis.wh40kAttack.teardown());
        }
    });
});
