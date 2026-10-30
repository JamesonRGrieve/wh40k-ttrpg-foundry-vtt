import {
    attackWith,
    awaitCard,
    awaitRollDialog,
    clickInCard,
    closeWindow,
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
    viewScene,
} from './combat-resolution-flow';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { compendiumUuid } from './lib/pack-lookup';
import { expect, test } from './lib/test';

/**
 * Tier B — talents whose mechanic is a data hook on the talent document (#101),
 * each driven from the sheet or the weapon the way a player uses it:
 *
 *   1. Push the Limit (situational row data): an Operate test opened from the Skills
 *      tab offers its +20 row; failing the boosted test by 4+ degrees puts the Motive
 *      Systems critical roll on the card; a second Operate test in the same combat
 *      round shows the row spent and unselectable.
 *   2. Leaping Dodge (an area-avoidance test substitution): a Spray caught in the
 *      cone is avoided with Dodge instead of Agility — the area results card names
 *      each creature's test.
 *   3. Field Vivisection (a Called Shot test substitution): a melee Called Shot at a
 *      xenos, by a character with Forbidden Lore (Xenos), rolls Medicae (WS) instead
 *      of Weapon Skill — the attack card's base row says so.
 *
 * Each flow records a `talent-hooks.flow` coverage key; keep TALENT_HOOK_FLOWS
 * in sync with the denominator in scripts/e2e-coverage.mjs.
 */

const TALENT_HOOK_FLOWS = ['push-the-limit-row', 'push-the-limit-crit-risk', 'push-the-limit-spent', 'leaping-dodge-spray', 'field-vivisection-swap'] as const;

const dh2Talent = (docId: string): string => compendiumUuid({ line: 'dh2', category: 'talents' }, docId);
const PUSH_THE_LIMIT = dh2Talent('nmjVhqTarVFg891j');
const LEAPING_DODGE = dh2Talent('RZjZQh4sBTFlCk5k');
const FIELD_VIVISECTION = dh2Talent('V61f6ob25kbcYojg');
const dh2Weapon = (docId: string): string => compendiumUuid({ line: 'dh2', category: 'weapons' }, docId);
const HAND_FLAMER = dh2Weapon('j7K8l9M0n1O2p3Q4');
const CHAINSWORD = dh2Weapon('z5A6b7C8d9E0f1G2');

function dh2Character(name: string, system: object = {}): object {
    return { name, type: 'dh2-character', img: 'icons/svg/mystery-man.svg', system: { gameSystem: 'dh2', ...system } };
}

test.describe.serial('Talent test hooks (Tier B, DH2, #101)', () => {
    test('Push the Limit: the +20 row, the Motive Systems risk on a bad failure, and once per round', async ({ page }) => {
        await joinOrSkip(page);
        await prepareStage(page);
        const settings = await setWorldSettings(page, { 'allow-manual-roll': true });
        const driver = await createActor(page, {
            data: dh2Character('Penal Driver', { characteristics: { agility: { base: 30, advance: 0, modifier: 0 } } }),
            compendiumItems: [{ uuid: PUSH_THE_LIMIT }],
        });
        const stage = await stageScene(page, 'Push the Limit', [{ actorId: driver.id, x: 400, y: 300 }]);
        const combatId = await startCombat(page, stage.sceneId, [{ actorId: driver.id, initiative: 10 }]);
        const operateRoll = '[data-action="roll"][data-roll-type="skill"][data-roll-target="operate"]';
        try {
            // The Operate test from the sheet's Skills tab offers the talent's row.
            const sheetId = await openActorSheet(page, driver.id, 'skills');
            await page.locator(`#${sheetId} ${operateRoll}`).first().click();
            const dialogId = await awaitRollDialog(page);
            await closeWindow(page, sheetId);
            const push = page.locator(`#${dialogId} [data-action="toggleSituational"]`, { hasText: 'Push the Limit' });
            await expect(push).toBeEnabled();
            await push.click();
            await expect(push).toHaveAttribute('aria-pressed', 'true');
            expect(await snapWindow(page, 'talent-push-the-limit-row', dialogId)).not.toBeNull();
            recordCoverage('talent-hooks.flow', 'push-the-limit-row');

            // Failing the boosted test by 4+ degrees: the card names the critical table and its dice.
            const before = await messageIds(page);
            await enterRoll(page, dialogId, 96);
            await submitRoll(page, dialogId);
            const card = await awaitCard(page, before, 'Push the Limit');
            expect(card.html, 'the +20 is a sourced row on the card').toContain('+20');
            expect(card.html, 'the critical roll is stated with its dice').toContain('1d5');
            expect(await snapCard(page, 'talent-push-the-limit-crit-risk', card.id)).not.toBeNull();
            recordCoverage('talent-hooks.flow', 'push-the-limit-crit-risk');

            // The same combat round: the row is spent, visible and unselectable.
            const sheetAgain = await openActorSheet(page, driver.id, 'skills');
            await page.locator(`#${sheetAgain} ${operateRoll}`).first().click();
            const secondDialogId = await awaitRollDialog(page);
            await closeWindow(page, sheetAgain);
            const spent = page.locator(`#${secondDialogId} [data-action="toggleSituational"]`, { hasText: 'Push the Limit' });
            await expect(spent).toBeDisabled();
            await expect(spent).toHaveAttribute('data-situational-spent', 'true');
            expect(await snapWindow(page, 'talent-push-the-limit-spent', secondDialogId)).not.toBeNull();
            await closeWindow(page, secondDialogId);
            recordCoverage('talent-hooks.flow', 'push-the-limit-spent');
        } finally {
            await restoreSettings(page, settings);
            await viewScene(page, stage.previousSceneId);
            await deleteDocuments(page, { combats: [combatId], scenes: [stage.sceneId], actors: [driver.id] });
        }
    });

    test('Leaping Dodge: a Spray is avoided with Dodge, not Agility', async ({ page }) => {
        await joinOrSkip(page);
        await prepareStage(page);
        const settings = await setWorldSettings(page, { 'allow-manual-roll': true, 'require-combat-to-attack': false });
        const gunner = await createActor(page, {
            data: dh2Character('Flamer Gunner', { characteristics: { ballisticSkill: { base: 50, advance: 0, modifier: 0 } } }),
            compendiumItems: [{ uuid: HAND_FLAMER, equip: true }],
        });
        // Agility 40: the untrained Dodge test is 20 (DH2 −20), so the two tests read apart on the card.
        const agile = { characteristics: { agility: { base: 40, advance: 0, modifier: 0 } } };
        const acrobat = await createActor(page, { data: dh2Character('Leaping Acrobat', agile), compendiumItems: [{ uuid: LEAPING_DODGE }] });
        const bystander = await createActor(page, { data: dh2Character('Plain Bystander', agile) });
        // Grid 100 px = 1 m: the gunner fires east; the acrobat 5 m out on the axis, the bystander 7 m out, 4° off it — both in the 30° cone.
        const stage = await stageScene(page, 'Spray', [
            { actorId: gunner.id, x: 200, y: 500 },
            { actorId: acrobat.id, x: 700, y: 500 },
            { actorId: bystander.id, x: 900, y: 550 },
        ]);
        try {
            await targetActor(page, acrobat.id);
            const before = await messageIds(page);
            const dialogId = await attackWith(page, gunner.id, gunner.items['Hand Flamer'] ?? '');
            await page.locator(`#${dialogId} [data-action="systemRoll"]`).click();
            await page.waitForSelector(`#${dialogId}`, { state: 'detached' });
            const sprayCard = await awaitCard(page, before, 'roll-control__resolve-area');
            const beforeResolve = await messageIds(page);
            await clickInCard(page, sprayCard.id, '.roll-control__resolve-area');
            const results = await awaitCard(page, beforeResolve, 'Leaping Acrobat');
            const acrobatRow = /Leaping Acrobat[\s\S]*?(Dodge|Agility) test/.exec(results.html)?.[1];
            const bystanderRow = /Plain Bystander[\s\S]*?(Dodge|Agility) test/.exec(results.html)?.[1];
            expect(acrobatRow, 'Leaping Dodge avoids the Spray with Dodge').toBe('Dodge');
            expect(bystanderRow, 'without it, the Spray is avoided with Agility').toBe('Agility');
            const testBase = (who: string): string | undefined =>
                new RegExp(`${who}[\\s\\S]*?(?:Dodge|Agility) test</span>\\s*<span[^>]*>\\s*(\\d+)`).exec(results.html)?.[1];
            expect(testBase('Leaping Acrobat'), 'the Dodge test base (Agility 40, untrained −20)').toBe('20');
            expect(testBase('Plain Bystander'), 'the Agility test base').toBe('40');
            expect(await snapCard(page, 'talent-leaping-dodge-spray-results', results.id)).not.toBeNull();
            recordCoverage('talent-hooks.flow', 'leaping-dodge-spray');
        } finally {
            await restoreSettings(page, settings);
            await viewScene(page, stage.previousSceneId);
            await deleteDocuments(page, { scenes: [stage.sceneId], actors: [gunner.id, acrobat.id, bystander.id] });
        }
    });

    test('Field Vivisection: a melee Called Shot at a xenos rolls Medicae (WS)', async ({ page }) => {
        await joinOrSkip(page);
        await prepareStage(page);
        const settings = await setWorldSettings(page, { 'allow-manual-roll': true, 'require-combat-to-attack': false, 'auto-roll-damage': false });
        const surgeon = await createActor(page, {
            data: dh2Character('Xenos Vivisector', {
                characteristics: { weaponSkill: { base: 30, advance: 0, modifier: 0 }, intelligence: { base: 50, advance: 0, modifier: 0 } },
                skills: { medicae: { advance: 2 }, forbiddenLore: { entries: [{ name: 'Xenos', advance: 1 }] } },
            }),
            compendiumItems: [
                { uuid: CHAINSWORD, equip: true },
                { uuid: FIELD_VIVISECTION, system: { specialization: 'Melee' } },
            ],
        });
        const xenos = await createActor(page, {
            data: { name: 'Studied Xenos', type: 'dh2-npc', img: 'icons/svg/mystery-man.svg', system: { gameSystem: 'dh2', nature: 'xenos' } },
        });
        const stage = await stageScene(page, 'Vivisection', [
            { actorId: surgeon.id, x: 400, y: 300 },
            { actorId: xenos.id, x: 500, y: 300 },
        ]);
        try {
            await targetActor(page, xenos.id);
            const before = await messageIds(page);
            const dialogId = await attackWith(page, surgeon.id, surgeon.items['Chainsword'] ?? '');
            await selectAttackMode(page, dialogId, 'calledShot');
            await enterRoll(page, dialogId, 10);
            expect(await snapWindow(page, 'talent-field-vivisection-dialog', dialogId)).not.toBeNull();
            await submitRoll(page, dialogId);
            const card = await awaitCard(page, before, 'Field Vivisection');
            expect(card.html, 'the base row names the Medicae swap').toContain('— Field Vivisection');
            // Medicae (WS) = WS 30 + Medicae's own training offset (Trained, +10 over Int): 40.
            expect(/Field Vivisection<\/span>\s*<span[^>]*>\s*(\d+)/.exec(card.html)?.[1], 'the swapped base keeps Medicae’s training over WS').toBe('40');
            expect(await snapCard(page, 'talent-field-vivisection-card', card.id)).not.toBeNull();
            recordCoverage('talent-hooks.flow', 'field-vivisection-swap');
            expect(TALENT_HOOK_FLOWS).toHaveLength(5);
        } finally {
            await restoreSettings(page, settings);
            await viewScene(page, stage.previousSceneId);
            await deleteDocuments(page, { scenes: [stage.sceneId], actors: [surgeon.id, xenos.id] });
        }
    });
});
