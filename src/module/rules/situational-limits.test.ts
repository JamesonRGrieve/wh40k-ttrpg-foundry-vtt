import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { type DeclaredPack, readDeclaredPacks } from '../../../scripts/lib/pack-manifest.mjs';
import { HAS_PRIVATE_CONTENT } from '../testing/private-content.ts';
import { isLineBookPack } from '../utils/line-packs.ts';
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
    const consequence: SituationalFailureConsequence = { minDof: 4, tableUuid: 'Compendium.wh40k-rpg.dh2-rolltables.RollTable.x', formula: '1d5' };

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
 * Push the Limit (a DH2 supplement): once per round, the character may add +20 to
 * an Operate test (or Survival test in the case of living steeds); failing it by 4
 * or more degrees of failure rolls 1d5 on the Motive Systems Critical Hit Effects
 * table, or, riding a living mount, on the Impact Critical Effects – Leg table.
 */
describe.skipIf(!HAS_PRIVATE_CONTENT)('Push the Limit pack data (#101)', () => {
    const REPO_ROOT = resolve(__dirname, '../../..');
    const PACKS = resolve(REPO_ROOT, 'src/packs-private');
    /** A declared pack's `_source` directory under the private content root. */
    const sourceDir = (pack: DeclaredPack): string => resolve(PACKS, pack.path.replace(/^packs\//, ''), '_source');
    /** `line`'s book packs of `category`, by manifest flags (read only inside a test). */
    const bookPacks = (line: string, category: string): DeclaredPack[] =>
        readDeclaredPacks(REPO_ROOT).packs.filter((pack) => isLineBookPack(pack, line, category));
    /** The path of `file` in whichever of `line`'s book talents packs holds it. */
    function talentSource(line: string, file: string): string {
        const path = bookPacks(line, 'talents')
            .map((pack) => resolve(sourceDir(pack), file))
            .find((candidate) => existsSync(candidate));
        if (path === undefined) throw new Error(`no ${line} talents pack holds ${file}`);
        return path;
    }
    /** The UUID a DH2 rolltables pack gives the table document `id`, wherever it is declared. */
    function dh2TableUuid(id: string): string {
        const pack = bookPacks('dh2', 'rolltables').find((candidate) => readdirSync(sourceDir(candidate)).some((name) => name.endsWith(`_${id}.json`)));
        return `Compendium.wh40k-rpg.${pack?.name ?? ''}.RollTable.${id}`;
    }
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
    const read = (path: string): PackTalent => JSON.parse(readFileSync(path, 'utf8')) as PackTalent;
    // Read in beforeAll, not the describe body: a skipped describe's body still runs to
    // collect its tests, so a read here fails where the private content is absent (CI).
    let dh2: PackTalent;
    let rows: PackRow[] = [];
    beforeAll(() => {
        dh2 = read(talentSource('dh2', 'push-the-limit_nmjVhqTarVFg891j.json'));
        rows = dh2.system.modifiers.situational.skills;
    });
    const row = (key: string): PackRow | undefined => rows.find((r) => r.key === key);
    /** Whether a `Compendium.wh40k-rpg.<dh2 rolltables pack>.RollTable.<id>` UUID names a source document that exists. */
    function tableFileExists(uuid: string): boolean {
        const pattern = /^Compendium\.wh40k-rpg\.([^.]+)\.RollTable\.([A-Za-z0-9]{16})$/;
        const pack = bookPacks('dh2', 'rolltables').find((candidate) => candidate.name === uuid.replace(pattern, '$1'));
        if (!pattern.test(uuid) || pack === undefined) return false;
        const dir = sourceDir(pack);
        const suffix = `_${uuid.replace(pattern, '$2')}.json`;
        return existsSync(dir) && readdirSync(dir).some((name) => name.endsWith(suffix));
    }

    it('+20 once per round on Operate and on Survival (living steed)', () => {
        expect(row('operate')).toMatchObject({ value: 20, oncePerRound: true });
        expect(row('survival')).toMatchObject({ value: 20, oncePerRound: true });
    });

    it('4+ DoF: 1d5 on Motive Systems (Operate) or Impact – Leg (Survival), each an existing DH2 rolltable', () => {
        expect(row('operate')?.failureConsequence).toEqual({
            minDof: 4,
            tableUuid: dh2TableUuid('pYlUeFBqbiSNrpIh'),
            formula: '1d5',
        });
        expect(row('survival')?.failureConsequence).toEqual({
            minDof: 4,
            tableUuid: dh2TableUuid('Eadf0zjxW4iWpdqT'),
            formula: '1d5',
        });
        for (const r of rows) expect(tableFileExists(r.failureConsequence?.tableUuid ?? '')).toBe(true);
    });

    it('carries no dead activated hook doubling the +20, and is a Tech talent, not Psychic', () => {
        expect(Object.hasOwn(dh2.system.modifiers, 'dynamicModifiers')).toBe(false);
        expect(dh2.system.category['dh2']).toBe('tech');
    });

    it('the OW Push the Limit (a different printed rule) carries no DH2 limit or table', () => {
        const ow = read(talentSource('ow', 'push-the-limit_XV2bPZ2H5z8VydMh.json'));
        expect(ow.system.modifiers.situational.skills.some((r) => r.oncePerRound === true || r.failureConsequence !== undefined)).toBe(false);
    });
});
