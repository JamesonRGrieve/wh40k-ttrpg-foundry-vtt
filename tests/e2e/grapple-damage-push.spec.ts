import type { Page } from '@playwright/test';
import {
    actorFlag,
    awaitCard,
    clickInCard,
    createActor,
    deleteDocuments,
    messageIds,
    openActorSheet,
    prepareStage,
    restoreSettings,
    setWorldSettings,
    snapCard,
    stageScene,
    viewScene,
} from './combat-resolution-flow';
import { canvasClip } from './lib/canvas-capture';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B — what the grapple options do once they resolve (#665; DH2 core pp. 221–222).
 *
 * - Damage Opponent won: the controller's own Unarmed strike hits the held target
 *   through the normal damage path. The damage card shows the hit on the Body, the
 *   Strength Bonus row and the +1 Fatigue with its source, and (auto-apply on) the
 *   target's wounds and Fatigue change.
 * - Push Opponent won: the card prints 1 m plus 1 m per degree of success, capped at
 *   the controller's Half Move. The GM's button opens the direction dialog, and both
 *   tokens move that far, the controller following to keep the grapple.
 * - Use Item: the controller picks a readied item; the card names it as a link.
 *
 * Each step records a `grapple.flow` coverage key; keep GRAPPLE_RESOLUTION_FLOWS in
 * sync with the denominator in scripts/e2e-coverage.mjs.
 */

const GRAPPLE_RESOLUTION_FLOWS = ['damage-opponent', 'push-opponent', 'use-item'] as const;

/** The Unarmed strike every creature is granted; its content declares it unarmed. */
const UNARMED_UUID = 'Compendium.wh40k-rpg.im-core-items-weapons.Item.jfGqgHO39b7wpwoK';

const PANEL = '[data-wh40k-hook="grapple-panel"]';
const OWN = `${PANEL} [data-wh40k-hook="grapple-section"][data-grapple-own="true"]`;

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
            // Foundry maps a uniform u to the face ceil((1 − u) × faces) (DiceTerm#mapRandomFace).
            return face === undefined ? original() : 1 - (face - 0.5) / 100;
        };
    }, faces);
}

/** An actor's current wounds and Fatigue. */
async function woundsAndFatigue(page: Page, actorId: string): Promise<{ wounds: number; fatigue: number }> {
    return page.evaluate((id) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
        const g = globalThis as unknown as {
            game: { actors: { get: (i: string) => { system: { wounds: { value: number }; fatigue: { value: number } } } | undefined } };
        };
        const system = g.game.actors.get(id)?.system;
        return { wounds: system?.wounds.value ?? -1, fatigue: system?.fatigue.value ?? -1 };
    }, actorId);
}

/** Each actor's token position on the viewed scene, and the scene's grid. */
async function tokenPositions(
    page: Page,
    actorIds: readonly string[],
): Promise<{ grid: { size: number; distance: number }; tokens: Array<{ x: number; y: number }> }> {
    return page.evaluate((ids) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `canvas` global has no browser-side types
        const g = globalThis as unknown as {
            canvas: { scene: { grid: { size: number; distance: number }; tokens: { contents: Array<{ actorId: string; x: number; y: number }> } } };
        };
        const scene = g.canvas.scene;
        return {
            grid: { size: scene.grid.size, distance: scene.grid.distance },
            tokens: ids.map((id) => {
                const token = scene.tokens.contents.find((t) => t.actorId === id);
                return { x: token?.x ?? -1, y: token?.y ?? -1 };
            }),
        };
    }, actorIds);
}

async function setGrapple(page: Page, controllerId: string, heldId: string): Promise<void> {
    await page.evaluate(
        async ({ c, h }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
            const g = globalThis as unknown as {
                game: { actors: { get: (i: string) => { setFlag: (s: string, k: string, v: object) => Promise<object> } | undefined } };
            };
            await g.game.actors.get(c)?.setFlag('wh40k-rpg', 'grapple', { state: 'grappling', opponentUuid: `Actor.${h}`, thrownDown: false });
            await g.game.actors.get(h)?.setFlag('wh40k-rpg', 'grapple', { state: 'controlled', opponentUuid: `Actor.${c}`, thrownDown: false });
        },
        { c: controllerId, h: heldId },
    );
}

test.describe.serial('Grapple option effects (Tier B, #665)', () => {
    test('Damage Opponent hits through the damage path; Push moves the tokens on the GM’s word; Use Item names its item', async ({ page }) => {
        await joinOrSkip(page);
        await prepareStage(page);
        const settings = await setWorldSettings(page, { 'auto-apply-damage': true });
        const character = (name: string, strength: number, toughness: number): object => ({
            name,
            type: 'dh2-character',
            img: 'icons/svg/mystery-man.svg',
            prototypeToken: { actorLink: true },
            system: {
                gameSystem: 'dh2',
                wounds: { max: 14, value: 14 },
                characteristics: {
                    strength: { base: strength, advance: 0, modifier: 0 },
                    toughness: { base: toughness, advance: 0, modifier: 0 },
                    agility: { base: 40, advance: 0, modifier: 0 },
                },
            },
        });
        const controller = await createActor(page, {
            data: character('Grappling Enforcer', 40, 30),
            compendiumItems: [{ uuid: UNARMED_UUID }],
            items: [{ name: 'Mono-knife', type: 'weapon', img: 'icons/svg/sword.svg', system: { state: { equipped: true } } }],
        });
        const held = await createActor(page, { data: character('Held Heretic', 30, 10) });
        const scene = await stageScene(page, 'Grapple push (#665)', [
            { actorId: controller.id, x: 300, y: 300 },
            { actorId: held.id, x: 400, y: 300 },
        ]);
        try {
            await setGrapple(page, controller.id, held.id);
            const sheet = await openActorSheet(page, controller.id, 'overview');
            await expect(page.locator(`#${sheet} ${OWN} [data-grapple-option="damage-opponent"]`)).toBeVisible();

            // Damage Opponent: 05 against the target's 99 wins; the unarmed hit follows on its own damage card.
            const woundsBefore = await woundsAndFatigue(page, held.id);
            let before = await messageIds(page);
            await fixD100(page, [5, 99]);
            await page.locator(`#${sheet} ${OWN} [data-grapple-option="damage-opponent"]`).click();
            const damageCard = await awaitCard(page, before, 'data-damage-fatigue');
            expect(damageCard.html).toContain('data-damage-fatigue-source');
            expect(damageCard.html).toContain('Damage Opponent');
            expect(damageCard.html).toContain('strength bonus');
            await expect
                .poll(async () => woundsAndFatigue(page, held.id), { message: 'the hit is applied to the held target' })
                .toEqual(expect.objectContaining({ fatigue: woundsBefore.fatigue + 1 }));
            const woundsAfter = await woundsAndFatigue(page, held.id);
            expect(woundsAfter.wounds, 'the unarmed hit took wounds').toBeLessThan(woundsBefore.wounds);
            expect(await snapCard(page, 'grapple-damage-opponent-hit', damageCard.id)).not.toBeNull();
            const heldSheet = await openActorSheet(page, held.id, 'overview');
            expect(await snap(page, 'grapple-damage-applied-wounds', { selector: `#${heldSheet}` })).not.toBeNull();
            recordCoverage('grapple.flow', 'damage-opponent');

            // Push Opponent: 05 against 40 is 4 DoS, 1 + 4 = 5 m, capped at the 4 m Half Move.
            before = await messageIds(page);
            await fixD100(page, [5, 99]);
            await openActorSheet(page, controller.id, 'overview');
            await page.locator(`#${sheet} ${OWN} [data-grapple-option="push-opponent"]`).click();
            const pushCard = await awaitCard(page, before, 'data-wh40k-hook="grapple-push"');
            expect(pushCard.html).toContain('data-grapple-push-metres="4"');
            expect(pushCard.html).toContain('data-grapple-push-row="cap"');
            expect(await snapCard(page, 'grapple-push-card', pushCard.id)).not.toBeNull();
            const start = await tokenPositions(page, [controller.id, held.id]);
            const step = Math.floor(4 / start.grid.distance) * start.grid.size;
            // The frame spans where the tokens start and where the push puts them.
            const centre = (token: { x: number; y: number }): { x: number; y: number } => ({
                x: token.x + start.grid.size / 2,
                y: token.y + start.grid.size / 2,
            });
            const ends = start.tokens.map((token) => ({ x: token.x + step, y: token.y }));
            const pushFrame = await canvasClip(page, [...start.tokens, ...ends].map(centre), start.grid.size);
            expect(pushFrame, 'the canvas is drawn').not.toBeNull();
            expect(await snap(page, 'grapple-push-tokens-before', { clip: pushFrame ?? undefined, closeWindows: true })).not.toBeNull();
            await clickInCard(page, pushCard.id, '.roll-control__grapple-push');
            const dialog = page.locator('dialog.application[open]', { has: page.locator('[data-wh40k-hook="grapple-push-dialog"]') });
            await expect(dialog).toBeVisible();
            await dialog.locator('input[name="direction"][value="e"]').check();
            const dialogId = (await dialog.getAttribute('id')) ?? '';
            expect(await snap(page, 'grapple-push-dialog', { selector: `#${dialogId}` })).not.toBeNull();
            await dialog.locator('button[data-action="ok"]').click();
            await expect
                .poll(async () => (await tokenPositions(page, [controller.id, held.id])).tokens, { message: 'both tokens move east together' })
                .toEqual(ends);
            expect(await actorFlag(page, controller.id, 'grapple'), 'following keeps the grapple').toEqual({
                state: 'grappling',
                opponentUuid: `Actor.${held.id}`,
                thrownDown: false,
            });
            expect(await snap(page, 'grapple-push-tokens-moved', { clip: pushFrame ?? undefined, closeWindows: true })).not.toBeNull();
            recordCoverage('grapple.flow', 'push-opponent');

            // Use Item: the controller picks its readied Mono-knife, and the card links it.
            before = await messageIds(page);
            const reopened = await openActorSheet(page, controller.id, 'overview');
            await page.locator(`#${reopened} ${OWN} [data-grapple-option="use-item"]`).click();
            const picker = page.locator('dialog.application[open]', { has: page.locator('[data-wh40k-hook="grapple-item-dialog"]') });
            await expect(picker).toBeVisible();
            await expect(picker).toContainText('Mono-knife');
            await expect(picker).not.toContainText('Unarmed');
            const pickerId = (await picker.getAttribute('id')) ?? '';
            expect(await snap(page, 'grapple-use-item-picker', { selector: `#${pickerId}` })).not.toBeNull();
            await picker.locator('button[data-action="ok"]').click();
            const itemCard = await awaitCard(page, before, 'data-wh40k-hook="grapple-item"');
            expect(itemCard.html).toContain('Mono-knife');
            expect(itemCard.html).toContain(`Actor.${controller.id}.Item.`);
            expect(await snapCard(page, 'grapple-use-item-card', itemCard.id)).not.toBeNull();
            // The link opens the item's own sheet.
            await clickInCard(page, itemCard.id, 'a.content-link');
            await expect
                .poll(
                    async () =>
                        page.evaluate(
                            ({ actorId, itemId }) => {
                                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
                                const g = globalThis as unknown as {
                                    game: {
                                        actors: {
                                            get: (i: string) => { items: { get: (i: string) => { sheet: { rendered: boolean } } | undefined } } | undefined;
                                        };
                                    };
                                };
                                return g.game.actors.get(actorId)?.items.get(itemId)?.sheet.rendered ?? false;
                            },
                            { actorId: controller.id, itemId: controller.items['Mono-knife'] ?? '' },
                        ),
                    { message: 'the named item’s sheet opens' },
                )
                .toBe(true);
            recordCoverage('grapple.flow', 'use-item');
            expect(GRAPPLE_RESOLUTION_FLOWS).toHaveLength(3);
        } finally {
            await restoreSettings(page, settings);
            await viewScene(page, scene.previousSceneId);
            await deleteDocuments(page, { actors: [controller.id, held.id], scenes: [scene.sceneId] });
        }
    });
});
