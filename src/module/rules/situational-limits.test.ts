import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HAS_PRIVATE_CONTENT } from '../testing/private-content.ts';
import type { CombatRoundStamp } from './counter-attack.ts';
import {
    activeFailureConsequence,
    failureConsequenceField,
    failureConsequenceFires,
    isRowSpent,
    readRoundUses,
    roundUseKey,
    type SituationalFailureConsequence,
    stampRoundUses,
} from './situational-limits.ts';

const ROUND_2: CombatRoundStamp = { combatId: 'c1', round: 2 };
const ROUND_3: CombatRoundStamp = { combatId: 'c1', round: 3 };
const OTHER_COMBAT: CombatRoundStamp = { combatId: 'c2', round: 2 };

const pushRow = { key: 'operate', itemId: 'ptl01', oncePerRound: true };
const plainRow = { key: 'operate', itemId: 'other' };

describe('once-per-round situational rows (#101)', () => {
    it('keys a use by owning item and row key, flattening anything that would read as a flag path', () => {
        expect(roundUseKey(pushRow)).toBe('ptl01_operate');
        expect(roundUseKey({ key: 'commonLore.imperium', itemId: 'x' })).toBe('x_commonLore_imperium');
    });

    it('a row used this round is spent; the next round, another combat, or no combat frees it', () => {
        const uses = { [roundUseKey(pushRow)]: ROUND_2 };
        expect(isRowSpent(pushRow, uses, ROUND_2)).toBe(true);
        expect(isRowSpent(pushRow, uses, ROUND_3)).toBe(false);
        expect(isRowSpent(pushRow, uses, OTHER_COMBAT)).toBe(false);
        expect(isRowSpent(pushRow, uses, null)).toBe(false);
    });

    it('a row without the limit is never spent', () => {
        expect(isRowSpent(plainRow, { [roundUseKey(plainRow)]: ROUND_2 }, ROUND_2)).toBe(false);
    });

    it('stamping records only the limited rows, keeps earlier stamps, and writes nothing out of combat', () => {
        const earlier = { old_row: ROUND_2 };
        expect(stampRoundUses(earlier, [pushRow, plainRow], ROUND_3)).toEqual({ old_row: ROUND_2, ptl01_operate: ROUND_3 });
        expect(stampRoundUses(earlier, [plainRow], ROUND_3)).toBeNull();
        expect(stampRoundUses(earlier, [pushRow], null)).toBeNull();
    });

    it('a stamped row is spent on the next roll the same round', () => {
        const next = stampRoundUses({}, [pushRow], ROUND_2);
        expect(next).not.toBeNull();
        expect(isRowSpent(pushRow, readRoundUses(next), ROUND_2)).toBe(true);
    });

    it('reads back only well-formed stamps from the flag', () => {
        expect(readRoundUses({ a: ROUND_2, b: { combatId: 3 }, c: 'x' })).toEqual({ a: ROUND_2 });
        expect(readRoundUses(undefined)).toEqual({});
        expect(readRoundUses('nope')).toEqual({});
    });
});

describe('failure consequences on situational rows (#101)', () => {
    const consequence: SituationalFailureConsequence = { minDof: 4, tableUuid: 'Compendium.wh40k-rpg.dh2-core-rolltables.RollTable.x', formula: '1d5' };

    it('fires on a failure by the threshold or more, never on a success or a smaller failure', () => {
        expect(failureConsequenceFires(consequence, { success: false, dof: 4 })).toBe(true);
        expect(failureConsequenceFires(consequence, { success: false, dof: 6 })).toBe(true);
        expect(failureConsequenceFires(consequence, { success: false, dof: 3 })).toBe(false);
        expect(failureConsequenceFires(consequence, { success: true, dof: 0 })).toBe(false);
    });

    it('treats an unauthored (schema-default) or table-less block as no consequence', () => {
        expect(activeFailureConsequence(consequence)).toBe(consequence);
        expect(activeFailureConsequence({ minDof: 0, tableUuid: '', formula: '' })).toBeNull();
        expect(activeFailureConsequence({ minDof: 4, tableUuid: '', formula: '1d5' })).toBeNull();
        expect(activeFailureConsequence(null)).toBeNull();
        expect(activeFailureConsequence(undefined)).toBeNull();
    });

    it('spreads the field onto a collected row only when there is one', () => {
        expect(failureConsequenceField(consequence)).toEqual({ failureConsequence: consequence });
        expect(failureConsequenceField(null)).toEqual({});
    });
});

/**
 * Push the Limit (DH2 Enemies Without p. 63): "Once per round, the character may
 * add +20 to an Operate test (or Survival test in the case of living steeds);
 * however, if he fails the test by 4 or more degrees of failure, immediately roll
 * 1d5 on Table 7–32: Motive Systems Critical Hit Effects … If he is riding a
 * living mount, roll 1d5 on Table 7–18: Impact Critical Effects – Leg".
 */
describe.skipIf(!HAS_PRIVATE_CONTENT)('Push the Limit pack data (#101)', () => {
    const PACKS = resolve(__dirname, '../../packs-private');
    interface PackRow {
        key: string;
        value: number;
        oncePerRound?: boolean;
        failureConsequence?: SituationalFailureConsequence;
    }
    interface PackTalent {
        system: {
            category: Record<string, string>;
            modifiers: { situational: { skills: PackRow[] } };
        };
    }
    // eslint-disable-next-line no-restricted-syntax -- boundary: JSON.parse of a pack source document, narrowed to the fields under test
    const read = (file: string): PackTalent => JSON.parse(readFileSync(resolve(PACKS, file), 'utf8')) as PackTalent;
    const dh2 = read('dark-heresy-2/dh2-without-items-talents/_source/push-the-limit_nmjVhqTarVFg891j.json');
    const rows = dh2.system.modifiers.situational.skills;
    const row = (key: string): PackRow | undefined => rows.find((r) => r.key === key);
    /** Whether a `Compendium.wh40k-rpg.<dh2 rolltables pack>.RollTable.<id>` UUID names a source document that exists. */
    function tableFileExists(uuid: string): boolean {
        const pattern = /^Compendium\.wh40k-rpg\.(dh2-[a-z]+-rolltables)\.RollTable\.([A-Za-z0-9]{16})$/;
        const dir = resolve(PACKS, 'dark-heresy-2', uuid.replace(pattern, '$1'), '_source');
        const suffix = `_${uuid.replace(pattern, '$2')}.json`;
        return pattern.test(uuid) && existsSync(dir) && readdirSync(dir).some((name) => name.endsWith(suffix));
    }

    it('+20 once per round on Operate and on Survival (living steed)', () => {
        expect(row('operate')).toMatchObject({ value: 20, oncePerRound: true });
        expect(row('survival')).toMatchObject({ value: 20, oncePerRound: true });
    });

    it('4+ DoF: 1d5 on Motive Systems (Operate) or Impact – Leg (Survival), each an existing DH2 core rolltable', () => {
        expect(row('operate')?.failureConsequence).toEqual({
            minDof: 4,
            tableUuid: 'Compendium.wh40k-rpg.dh2-core-rolltables.RollTable.pYlUeFBqbiSNrpIh',
            formula: '1d5',
        });
        expect(row('survival')?.failureConsequence).toEqual({
            minDof: 4,
            tableUuid: 'Compendium.wh40k-rpg.dh2-core-rolltables.RollTable.Eadf0zjxW4iWpdqT',
            formula: '1d5',
        });
        for (const r of rows) expect(tableFileExists(r.failureConsequence?.tableUuid ?? '')).toBe(true);
    });

    it('carries no dead activated hook doubling the +20, and is a Tech talent, not Psychic', () => {
        expect(Object.hasOwn(dh2.system.modifiers, 'dynamicModifiers')).toBe(false);
        expect(dh2.system.category['dh2']).toBe('tech');
    });

    it('the OW Push the Limit (a different printed rule) carries no DH2 limit or table', () => {
        const ow = read('only-war/ow-hammer-items-talents/_source/push-the-limit_XV2bPZ2H5z8VydMh.json');
        expect(ow.system.modifiers.situational.skills.some((r) => r.oncePerRound === true || r.failureConsequence !== undefined)).toBe(false);
    });
});
