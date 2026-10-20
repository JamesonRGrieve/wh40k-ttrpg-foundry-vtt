import type { Page } from '@playwright/test';
import {
    awaitCard,
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
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B — damage auto-applied to an NPC (#420). NPCs suffer Fatigue as PCs do in
 * every line, but the NPC model carried no `fatigue`: the assign step threw reading
 * it, so no hit auto-applied to an NPC. A grapple's Damage Opponent (#665) deals an
 * unarmed hit plus 1 Fatigue through the normal damage path; with auto-apply on,
 * the held NPC's wounds drop and its Fatigue rises, and the NPC sheet's fatigue
 * panel shows the level.
 */

/** The Unarmed strike every creature is granted; its content declares it unarmed. */
const UNARMED_UUID = 'Compendium.wh40k-rpg.im-core-items-weapons.Item.jfGqgHO39b7wpwoK';
const OWN = '[data-wh40k-hook="grapple-panel"] [data-wh40k-hook="grapple-section"][data-grapple-own="true"]';

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

/** The NPC's wounds and Fatigue as its model holds them. */
async function npcVitals(page: Page, actorId: string): Promise<{ wounds: number; fatigue: number; fatigueMax: number }> {
    return page.evaluate((id) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
        const g = globalThis as unknown as {
            game: { actors: { get: (i: string) => { system: { wounds: { value: number }; fatigue?: { value: number; max: number } } } | undefined } };
        };
        const system = g.game.actors.get(id)?.system;
        return { wounds: system?.wounds.value ?? -1, fatigue: system?.fatigue?.value ?? -1, fatigueMax: system?.fatigue?.max ?? -1 };
    }, actorId);
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

test.describe.serial('Damage auto-applied to an NPC (Tier B, #420)', () => {
    test('a grapple’s Damage Opponent takes the held NPC’s wounds and adds its Fatigue', async ({ page }) => {
        await joinOrSkip(page);
        await prepareStage(page);
        const settings = await setWorldSettings(page, { 'auto-apply-damage': true });
        const controller = await createActor(page, {
            data: {
                name: 'Grappling Arbitrator',
                type: 'dh2-character',
                img: 'icons/svg/mystery-man.svg',
                prototypeToken: { actorLink: true },
                system: {
                    gameSystem: 'dh2',
                    characteristics: { strength: { base: 40, advance: 0, modifier: 0 }, agility: { base: 40, advance: 0, modifier: 0 } },
                },
            },
            compendiumItems: [{ uuid: UNARMED_UUID }],
        });
        const held = await createActor(page, {
            data: {
                name: 'Held Cultist',
                type: 'dh2-npc',
                img: 'icons/svg/mystery-man.svg',
                prototypeToken: { actorLink: true },
                system: {
                    wounds: { max: 12, value: 12, critical: 0 },
                    characteristics: { toughness: { base: 10 }, strength: { base: 30 }, willpower: { base: 30 } },
                },
            },
        });
        const scene = await stageScene(page, 'NPC auto-apply (#420)', [
            { actorId: controller.id, x: 300, y: 300 },
            { actorId: held.id, x: 400, y: 300 },
        ]);
        try {
            const before = await npcVitals(page, held.id);
            expect(before.fatigue, 'the NPC model carries a fatigue track').toBe(0);
            expect(before.fatigueMax, 'its threshold is derived as a PC’s is (DH2: TB + WPB)').toBe(4);

            await setGrapple(page, controller.id, held.id);
            const sheet = await openActorSheet(page, controller.id, 'overview');
            const posted = await messageIds(page);
            // 05 against the Cultist's 99 wins the opposed test; the unarmed hit follows.
            await fixD100(page, [5, 99]);
            await page.locator(`#${sheet} ${OWN} [data-grapple-option="damage-opponent"]`).click();
            const damageCard = await awaitCard(page, posted, 'data-damage-fatigue');
            await expect.poll(async () => (await npcVitals(page, held.id)).fatigue, { message: 'the hit’s Fatigue reaches the NPC' }).toBe(1);
            const after = await npcVitals(page, held.id);
            expect(after.wounds, 'the unarmed hit took wounds').toBeLessThan(before.wounds);
            expect(await snapCard(page, 'npc-auto-apply-grapple-damage-card', damageCard.id)).not.toBeNull();

            const npcSheet = await openActorSheet(page, held.id, 'npc');
            await expect(page.locator(`#${npcSheet} [data-toggle="fatigue_details"]`)).toBeVisible();
            expect(await snap(page, 'npc-auto-apply-wounds-fatigue-sheet', { selector: `#${npcSheet}` })).not.toBeNull();
        } finally {
            await restoreSettings(page, settings);
            await viewScene(page, scene.previousSceneId);
            await deleteDocuments(page, { actors: [controller.id, held.id], scenes: [scene.sceneId] });
        }
    });
});
