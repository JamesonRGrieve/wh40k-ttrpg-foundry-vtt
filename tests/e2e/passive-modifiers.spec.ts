import type { Page } from '@playwright/test';
import {
    attackWith,
    awaitRollDialog,
    closeWindow,
    createActor,
    deleteDocuments,
    openActorSheet,
    prepareStage,
    restoreSettings,
    setWorldSettings,
    snapWindow,
} from './combat-resolution-flow';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { compendiumUuid } from './lib/pack-lookup';
import { expect, test } from './lib/test';

/**
 * Tier B — the read-only passive-modifier block in the Roll Test dialog (#484).
 *
 * Reopened because Superior Chirurgeon's +20 Medicae "showed up nowhere" in the
 * roll screen. `first-aid-flow.spec.ts` already proves the +20 is APPLIED to the
 * live skill; this proves it is also SHOWN:
 *
 *   1. A Medicae test opened from the sheet's Skills tab, on a character that owns
 *      Superior Chirurgeon, lists the talent as a locked, non-interactive passive
 *      row (`modifiers.hbs` + `_passiveModifierRows` → `selectPassiveModifierRows`).
 *   2. A weapon attack rolls Weapon Skill, so the modifiers baked into WS are the
 *      passive rows of the attack dialog — opened from the weapon sheet's Attack.
 *
 * Each case records a `passive-modifiers.flow` coverage key; keep
 * PASSIVE_MODIFIER_FLOWS in sync with the denominator in scripts/e2e-coverage.mjs.
 */

const PASSIVE_MODIFIER_FLOWS = ['skill-test', 'weapon-attack'] as const;

const SUPERIOR_CHIRURGEON_UUID = compendiumUuid({ line: 'dh2', category: 'talents' }, 'DH2aTlnt00000071');
const CHAINSWORD_UUID = compendiumUuid({ line: 'dh2', category: 'weapons' }, 'z5A6b7C8d9E0f1G2');
/** A test-only talent whose flat +10 Weapon Skill is baked into the attack's base. */
const WS_DRILL = 'E2E Blade Drill';

/** The dialog's passive rows: [label, value] per locked row, and whether any sits inside a control. */
async function passiveRows(page: Page, dialogId: string): Promise<{ rows: string[][]; interactive: boolean }> {
    return page.evaluate((id) => {
        const dialog = document.getElementById(id);
        const locks = Array.from(dialog?.querySelectorAll('.fa-lock') ?? []);
        return {
            rows: locks.map((lock) => Array.from(lock.parentElement?.querySelectorAll('span') ?? [], (span) => span.textContent.trim())),
            interactive: locks.some((lock) => lock.closest('button, input, select, [data-action]') !== null),
        };
    }, dialogId);
}

test.describe.serial('Passive modifiers in the Roll Test dialog (Tier B, #484)', () => {
    test('Superior Chirurgeon renders as a read-only passive row in the Medicae roll dialog', async ({ page }) => {
        await joinOrSkip(page);
        await prepareStage(page);
        const medic = await createActor(page, {
            data: {
                name: 'Passive Medic',
                type: 'dh2-character',
                system: { gameSystem: 'dh2', characteristics: { intelligence: { base: 40, advance: 0, modifier: 0 } } },
            },
            compendiumItems: [{ uuid: SUPERIOR_CHIRURGEON_UUID }],
        });
        try {
            const sheetId = await openActorSheet(page, medic.id, 'skills');
            await page.locator(`#${sheetId} [data-action="roll"][data-roll-type="skill"][data-roll-target="medicae"]`).first().click();
            const dialogId = await awaitRollDialog(page);
            await closeWindow(page, sheetId);
            const passive = await passiveRows(page, dialogId);
            expect(
                passive.rows.map((row) => row[0]),
                'Superior Chirurgeon is listed as a passive row',
            ).toContain('Superior Chirurgeon');
            expect(passive.interactive, 'passive rows are information, not controls').toBe(false);
            expect(await snapWindow(page, 'passive-modifiers-medicae-dialog', dialogId)).not.toBeNull();
            await closeWindow(page, dialogId);
            recordCoverage('passive-modifiers.flow', 'skill-test');
        } finally {
            await deleteDocuments(page, { actors: [medic.id] });
        }
    });

    test('a weapon attack lists the modifiers baked into Weapon Skill', async ({ page }) => {
        await joinOrSkip(page);
        await prepareStage(page);
        const settings = await setWorldSettings(page, { 'require-combat-to-attack': false });
        const duellist = await createActor(page, {
            data: {
                name: 'Passive Duellist',
                type: 'dh2-character',
                system: { gameSystem: 'dh2', characteristics: { weaponSkill: { base: 40, advance: 0, modifier: 0 } } },
            },
            compendiumItems: [{ uuid: CHAINSWORD_UUID, equip: true }],
            items: [{ name: WS_DRILL, type: 'talent', system: { modifiers: { characteristics: { weaponSkill: 10 } } } }],
        });
        try {
            const dialogId = await attackWith(page, duellist.id, duellist.items['Chainsword'] ?? '');
            const passive = await passiveRows(page, dialogId);
            expect(
                passive.rows.map((row) => row[0]),
                'the WS modifier is the attack’s passive row',
            ).toContain(WS_DRILL);
            expect(passive.interactive).toBe(false);
            expect(await snapWindow(page, 'passive-modifiers-weapon-attack-dialog', dialogId)).not.toBeNull();
            await closeWindow(page, dialogId);
            recordCoverage('passive-modifiers.flow', 'weapon-attack');
            expect(PASSIVE_MODIFIER_FLOWS).toHaveLength(2);
        } finally {
            await restoreSettings(page, settings);
            await deleteDocuments(page, { actors: [duellist.id] });
        }
    });
});
