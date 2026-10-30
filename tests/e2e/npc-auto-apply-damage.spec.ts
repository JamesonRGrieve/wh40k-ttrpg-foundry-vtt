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
import { compendiumUuid, packHoldingName } from './lib/pack-lookup';
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
const UNARMED_UUID = `Compendium.wh40k-rpg.${packHoldingName({ line: 'im', category: 'weapons' }, 'Unarmed')}.Item.jfGqgHO39b7wpwoK`;
const OWN = '[data-wh40k-hook="grapple-panel"] [data-wh40k-hook="grapple-section"][data-grapple-own="true"]';

/** The held NPC's armour (simple mode) and Toughness Bonus, and the controller's Strength Bonus. */
const NPC_AP = 3;
const NPC_TB = 3;
const CONTROLLER_SB = 9;

/** The PC target's Machine rating and its Flak Vest's Body AP (#248). */
const PC_MACHINE = 2;
const PC_WORN_AP = 3;
const MACHINE_UUID = compendiumUuid({ line: 'dh2', category: 'traits' }, 'Ad9cR4FSt6HtEz8Q');
const FLAK_VEST_UUID = compendiumUuid({ line: 'dh2', category: 'armour' }, 'Ht6xNdQ2rBw9Km3P');

/** The total of a damage card's damage roll (the dice and the formula's own terms, before any added modifier row). */
async function damageRollTotal(page: Page, messageId: string): Promise<number> {
    return page.evaluate((id) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
        const g = globalThis as unknown as { game: { messages: { get: (i: string) => { rolls: Array<{ total: number }> } | undefined } } };
        return g.game.messages.get(id)?.rolls.at(0)?.total ?? Number.NaN;
    }, messageId);
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
                    // Strength 90 (SB 9): the unarmed 1d5 − 3 + SB deals 7–11, so it always gets past the NPC's soak of 6.
                    characteristics: { strength: { base: 90, advance: 0, modifier: 0 }, agility: { base: 40, advance: 0, modifier: 0 } },
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
                // Toughness 35 (TB 3) and 3 AP worn all over (simple mode): it soaks 3 + 3.
                system: {
                    wounds: { max: 12, value: 12, critical: 0 },
                    armour: { mode: 'simple', total: NPC_AP, authored: true },
                    characteristics: { toughness: { base: 35 }, strength: { base: 30 }, willpower: { base: 30 } },
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
            expect(before.fatigueMax, 'its threshold is derived as a PC’s is (DH2: TB + WPB)').toBe(NPC_TB + 3);

            await setGrapple(page, controller.id, held.id);
            const sheet = await openActorSheet(page, controller.id, 'overview');
            const posted = await messageIds(page);
            // 05 against the Cultist's 99 wins the opposed test; the unarmed hit follows.
            await fixD100(page, [5, 99]);
            await page.locator(`#${sheet} ${OWN} [data-grapple-option="damage-opponent"]`).click();
            const damageCard = await awaitCard(page, posted, 'data-damage-fatigue');
            await expect.poll(async () => (await npcVitals(page, held.id)).fatigue, { message: 'the hit’s Fatigue reaches the NPC' }).toBe(1);
            const after = await npcVitals(page, held.id);
            // The unarmed hit (Pen 0): damage = the rolled 1d5 − 3, plus SB 9. Wounds lost = damage − (AP − Pen) − TB (#248).
            const damage = (await damageRollTotal(page, damageCard.id)) + CONTROLLER_SB;
            expect(before.wounds - after.wounds, `damage ${damage} less AP ${NPC_AP} and TB ${NPC_TB}`).toBe(damage - NPC_AP - NPC_TB);
            expect(damageCard.html, 'the card’s Effective line reads the NPC’s armour and TB').toContain(`after armour ${NPC_AP} (post-pen) + TB ${NPC_TB}`);
            expect(await snapCard(page, 'npc-auto-apply-grapple-damage-card', damageCard.id)).not.toBeNull();

            const npcSheet = await openActorSheet(page, held.id, 'npc');
            await expect(page.locator(`#${npcSheet} [data-toggle="fatigue_details"]`)).toBeVisible();
            // A DH2 NPC halves characteristics while fatigued; it does not take a flat −10.
            await expect(page.locator(`#${npcSheet} [data-fatigue-warning]`)).toHaveAttribute('data-fatigue-warning', 'halving');
            expect(await snap(page, 'npc-auto-apply-wounds-fatigue-sheet', { selector: `#${npcSheet}` })).not.toBeNull();
        } finally {
            await restoreSettings(page, settings);
            await viewScene(page, scene.previousSceneId);
            await deleteDocuments(page, { actors: [controller.id, held.id], scenes: [scene.sceneId] });
        }
    });

    test('a PC soaks with its Machine trait and its worn armour together (#248)', async ({ page }) => {
        await joinOrSkip(page);
        await prepareStage(page);
        const settings = await setWorldSettings(page, { 'auto-apply-damage': true });
        const controller = await createActor(page, {
            data: {
                name: 'Grappling Enforcer',
                type: 'dh2-character',
                img: 'icons/svg/mystery-man.svg',
                prototypeToken: { actorLink: true },
                system: {
                    gameSystem: 'dh2',
                    characteristics: { strength: { base: 100, advance: 0, modifier: 0 }, agility: { base: 40, advance: 0, modifier: 0 } },
                },
            },
            compendiumItems: [{ uuid: UNARMED_UUID }],
        });
        // A cyborg acolyte: Machine (2) over an equipped Flak Vest (Body AP 3), Toughness 30 (TB 3).
        const held = await createActor(page, {
            data: {
                name: 'Held Tech-Thrall',
                type: 'dh2-character',
                img: 'icons/svg/mystery-man.svg',
                prototypeToken: { actorLink: true },
                system: {
                    gameSystem: 'dh2',
                    wounds: { max: 14, value: 14, critical: 0 },
                    characteristics: { toughness: { base: 30, advance: 0, modifier: 0 } },
                },
            },
            compendiumItems: [
                { uuid: MACHINE_UUID, system: { specialization: String(PC_MACHINE) } },
                { uuid: FLAK_VEST_UUID, equip: true },
            ],
        });
        const scene = await stageScene(page, 'PC soak (#248)', [
            { actorId: controller.id, x: 300, y: 300 },
            { actorId: held.id, x: 400, y: 300 },
        ]);
        try {
            const before = await npcVitals(page, held.id);
            await setGrapple(page, controller.id, held.id);
            const sheet = await openActorSheet(page, controller.id, 'overview');
            const posted = await messageIds(page);
            await fixD100(page, [5, 99]);
            await page.locator(`#${sheet} ${OWN} [data-grapple-option="damage-opponent"]`).click();
            const damageCard = await awaitCard(page, posted, 'data-damage-fatigue');
            await expect.poll(async () => (await npcVitals(page, held.id)).fatigue, { message: 'the hit is applied' }).toBe(1);
            const after = await npcVitals(page, held.id);
            // Damage (1d5 − 3 + SB 10) less Machine 2 + worn 3 (Pen 0) and TB 3; never below 0.
            const damage = (await damageRollTotal(page, damageCard.id)) + 10;
            const soaked = PC_MACHINE + PC_WORN_AP;
            expect(before.wounds - after.wounds, `damage ${damage} less armour ${soaked} and TB 3`).toBe(Math.max(0, damage - soaked - 3));
            expect(damageCard.html, 'the Effective line counts the Machine trait into the armour').toContain(`after armour ${soaked} (post-pen) + TB 3`);
            expect(damageCard.html, 'the Effective line prints its parts').toContain('data-damage-soak-row');
            expect(damageCard.html).toContain(`Machine / Natural Armour</span><span class="tw-shrink-0 tw-tabular-nums tw-font-semibold">-${PC_MACHINE}`);
            expect(damageCard.html).toContain(`Worn armour</span><span class="tw-shrink-0 tw-tabular-nums tw-font-semibold">-${PC_WORN_AP}`);
            expect(await snapCard(page, 'pc-machine-worn-armour-soak-damage-card', damageCard.id)).not.toBeNull();
        } finally {
            await restoreSettings(page, settings);
            await viewScene(page, scene.previousSceneId);
            await deleteDocuments(page, { actors: [controller.id, held.id], scenes: [scene.sceneId] });
        }
    });

    test('a PC in Best armour soaks with its +1 AP as its own row (#679)', async ({ page }) => {
        await joinOrSkip(page);
        await prepareStage(page);
        const settings = await setWorldSettings(page, { 'auto-apply-damage': true });
        const controller = await createActor(page, {
            data: {
                name: 'Grappling Enforcer',
                type: 'dh2-character',
                img: 'icons/svg/mystery-man.svg',
                prototypeToken: { actorLink: true },
                system: {
                    gameSystem: 'dh2',
                    characteristics: { strength: { base: 100, advance: 0, modifier: 0 }, agility: { base: 40, advance: 0, modifier: 0 } },
                },
            },
            compendiumItems: [{ uuid: UNARMED_UUID }],
        });
        // An acolyte in a Best-craftsmanship Flak Vest (Body AP 3, +1 for Best in DH2), Toughness 30 (TB 3).
        const held = await createActor(page, {
            data: {
                name: 'Held Noble Scion',
                type: 'dh2-character',
                img: 'icons/svg/mystery-man.svg',
                prototypeToken: { actorLink: true },
                system: {
                    gameSystem: 'dh2',
                    wounds: { max: 14, value: 14, critical: 0 },
                    characteristics: { toughness: { base: 30, advance: 0, modifier: 0 } },
                },
            },
            compendiumItems: [{ uuid: FLAK_VEST_UUID, equip: true, system: { craftsmanship: 'best' } }],
        });
        const scene = await stageScene(page, 'Best armour soak (#679)', [
            { actorId: controller.id, x: 300, y: 300 },
            { actorId: held.id, x: 400, y: 300 },
        ]);
        try {
            const before = await npcVitals(page, held.id);
            await setGrapple(page, controller.id, held.id);
            const sheet = await openActorSheet(page, controller.id, 'overview');
            const posted = await messageIds(page);
            await fixD100(page, [5, 99]);
            await page.locator(`#${sheet} ${OWN} [data-grapple-option="damage-opponent"]`).click();
            const damageCard = await awaitCard(page, posted, 'data-damage-fatigue');
            await expect.poll(async () => (await npcVitals(page, held.id)).fatigue, { message: 'the hit is applied' }).toBe(1);
            const after = await npcVitals(page, held.id);
            // Damage (1d5 − 3 + SB 10) less worn 3 + Best 1 (Pen 0) and TB 3.
            const damage = (await damageRollTotal(page, damageCard.id)) + 10;
            const soaked = PC_WORN_AP + 1;
            expect(before.wounds - after.wounds, `damage ${damage} less armour ${soaked} and TB 3`).toBe(Math.max(0, damage - soaked - 3));
            expect(damageCard.html, 'the Effective line counts Best craftsmanship into the armour').toContain(`after armour ${soaked} (post-pen) + TB 3`);
            expect(damageCard.html).toContain(`Worn armour</span><span class="tw-shrink-0 tw-tabular-nums tw-font-semibold">-${PC_WORN_AP}`);
            expect(damageCard.html, 'Best craftsmanship has its own row').toContain(
                'Best craftsmanship</span><span class="tw-shrink-0 tw-tabular-nums tw-font-semibold">-1',
            );
            expect(await snapCard(page, 'pc-best-armour-craftsmanship-soak-damage-card', damageCard.id)).not.toBeNull();
        } finally {
            await restoreSettings(page, settings);
            await viewScene(page, scene.previousSceneId);
            await deleteDocuments(page, { actors: [controller.id, held.id], scenes: [scene.sceneId] });
        }
    });
});
