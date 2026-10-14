import {
    actorFlag,
    attackWith,
    awaitCard,
    clickInCard,
    createActor,
    deleteDocuments,
    enterRoll,
    messageIds,
    openActorSheet,
    prepareStage,
    restoreSettings,
    selectAttackMode,
    setWorldSettings,
    snapCard,
    snapWindow,
    stageScene,
    startCombat,
    submitRoll,
    targetActor,
} from './combat-resolution-flow';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { forceDice, LOWEST_FACE, restoreDice } from './occult-sheet-flow';

/**
 * Tier B: a grapple starts from the attack and ends on a Break Free (#450).
 *
 * RAW (DH2 core p. 228 "Grappling"): instead of dealing damage, the attacker makes
 * a Weapon Skill attack; the target may use a Reaction to avoid it; if it succeeds
 * the two are grappling with the attacker in control. Nothing used to start one:
 * no flow wrote the grapple flags, so the grapple actions had no opponent.
 *
 * The GM targets the defender, attacks with the Grapple special option, the
 * defender takes the hit, and Begin Grapple on the attack card posts the start
 * card; both actors then carry the flag, each naming the other. The held
 * defender's Break Free (an Opposed Strength test against the controller found
 * through that flag, which the defender wins on a tie of rolls with the higher
 * Strength) ends the grapple for both.
 */

const CHAINSWORD_UUID = 'Compendium.wh40k-rpg.dh2-core-items-weapons.Item.z5A6b7C8d9E0f1G2';

function dh2Character(name: string, weaponSkill: number, strength: number): object {
    return {
        name,
        type: 'dh2-character',
        img: 'icons/svg/mystery-man.svg',
        system: {
            gameSystem: 'dh2',
            characteristics: {
                weaponSkill: { base: weaponSkill, advance: 0, modifier: 0 },
                strength: { base: strength, advance: 0, modifier: 0 },
                agility: { base: 30, advance: 0, modifier: 0 },
            },
        },
    };
}

test.describe.serial('Grapple start and end (Tier B, #450)', () => {
    test('a Grapple attack that lands starts a grapple both sides record; Break Free ends it', async ({ page }) => {
        await joinOrSkip(page);
        await prepareStage(page);
        const settings = await setWorldSettings(page, { 'allow-manual-roll': true, 'auto-roll-damage': false });
        const attacker = await createActor(page, {
            data: dh2Character('Grappling Heretic', 55, 30),
            compendiumItems: [{ uuid: CHAINSWORD_UUID, equip: true }],
        });
        const defender = await createActor(page, { data: dh2Character('Held Acolyte', 35, 50) });
        const stage = await stageScene(page, 'Grapple ring', [
            { actorId: attacker.id, x: 400, y: 300 },
            { actorId: defender.id, x: 500, y: 300 },
        ]);
        const combatId = await startCombat(page, stage.sceneId, [
            { actorId: attacker.id, initiative: 20 },
            { actorId: defender.id, initiative: 10 },
        ]);
        try {
            const weaponId = attacker.items['Chainsword'] ?? '';
            expect(weaponId, 'the attacker holds a melee weapon').not.toBe('');

            // The Grapple special option on the attack.
            await targetActor(page, defender.id);
            const before = await messageIds(page);
            const dialogId = await attackWith(page, attacker.id, weaponId);
            await page.locator(`#${dialogId} [data-action="toggleSpecialOptions"]`).click();
            await selectAttackMode(page, dialogId, 'grapple');
            await enterRoll(page, dialogId, 12);
            expect(await snapWindow(page, 'grapple-attempt-dialog', dialogId)).not.toBeNull();
            await submitRoll(page, dialogId);
            const attack = await awaitCard(page, before, 'data-evasion-status="');
            expect(attack.html, 'the attempt offers Begin Grapple, not damage').toContain('roll-control__begin-grapple');
            expect(attack.html).not.toContain('roll-control__roll-damage');

            // The defender takes the hit, then the grapple begins.
            const prompt = await awaitCard(page, before, 'data-evasion-prompt');
            const beforeTake = await messageIds(page);
            await clickInCard(page, prompt.id, '.roll-control__take-hit');
            await awaitCard(page, beforeTake, 'data-evasion-declined');
            const beforeStart = await messageIds(page);
            await clickInCard(page, attack.id, '.roll-control__begin-grapple');
            const start = await awaitCard(page, beforeStart, 'grapple-start-card');
            expect(start.html).toContain('Grappling Heretic has Held Acolyte in a grapple');
            expect(await snapCard(page, 'grapple-start-card', start.id)).not.toBeNull();

            const uuids = { attacker: `Actor.${attacker.id}`, defender: `Actor.${defender.id}` };
            await expect.poll(async () => actorFlag(page, attacker.id, 'grapple')).toEqual({ state: 'grappling', opponentUuid: uuids.defender });
            await expect.poll(async () => actorFlag(page, defender.id, 'grapple')).toEqual({ state: 'controlled', opponentUuid: uuids.attacker });

            // The held defender's sheet shows the grapple; Break Free tests against the controller from the flag.
            const sheetId = await openActorSheet(page, defender.id, 'overview');
            const panel = page.locator(`#${sheetId} [data-wh40k-hook="grapple-panel"]`);
            await expect(panel).toHaveAttribute('data-grapple-state', 'controlled');
            await clearScreenOverlays(page, sheetId);
            await snap(page, 'grapple-held-panel', { selector: `#${sheetId} [data-wh40k-hook="grapple-panel"]` });

            await forceDice(page, LOWEST_FACE);
            const beforeBreak = await messageIds(page);
            await panel.locator('[data-action="grappleBreakFree"]').click();
            const broke = await awaitCard(page, beforeBreak, 'data-wh40k-hook="grapple-card"');
            await restoreDice(page);
            expect(broke.html).toContain('Held Acolyte wins the test');
            expect(broke.html).toContain('Grappling Heretic');
            expect(broke.html).toContain('data-wh40k-hook="grapple-ended"');
            expect(await snapCard(page, 'grapple-break-free-card', broke.id)).not.toBeNull();
            await expect.poll(async () => actorFlag(page, attacker.id, 'grapple')).toEqual({ state: 'none', opponentUuid: null });
            await expect.poll(async () => actorFlag(page, defender.id, 'grapple')).toEqual({ state: 'none', opponentUuid: null });
            recordCoverage('action', 'beginGrapple');
            recordCoverage('action', 'grappleBreakFree.ends');
        } finally {
            await restoreDice(page);
            await restoreSettings(page, settings);
            await deleteDocuments(page, { actors: [attacker.id, defender.id], scenes: [stage.sceneId], combats: [combatId] });
        }
    });
});
