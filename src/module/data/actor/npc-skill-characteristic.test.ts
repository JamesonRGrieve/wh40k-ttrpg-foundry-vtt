import { afterAll, describe, expect, it } from 'vitest';
import { installFoundryDataStub } from '../../testing/foundry-data-stub.ts';
import { CHARACTERISTICS } from '../shared/characteristics.ts';

/**
 * An NPC skill row's label and its target name the same characteristic (#725).
 *
 * The row label, the row target, the specialisation target and the add-skill
 * write each resolved the characteristic on their own, and disagreed on a blank
 * stored value: a Dodge with no characteristic was labelled Perception and rolled
 * on Agility, and a specialisation with a blank one had a target of 0. They now
 * all read `NPCData.skillRowCharacteristic`.
 *
 * `npc.ts` needs only `foundry.abstract` + `foundry.data.fields` at module
 * evaluation, so the shared Foundry data stub is installed before its import.
 */
afterAll(installFoundryDataStub());

const { default: NPCData } = await import('./npc.ts');

type Npc = InstanceType<typeof NPCData>;

/** One stored skill row: what the test sets, the rest as the schema initialises it. */
interface StoredSkill {
    characteristic: string;
    advance?: number;
    entries?: Array<{ name: string; specialization?: string; characteristic?: string; advance: number; bonus?: number }>;
}

/** Characteristic totals far enough apart that a target names the characteristic it was computed on. */
const TOTALS = {
    weaponSkill: 20,
    ballisticSkill: 25,
    strength: 30,
    toughness: 35,
    agility: 40,
    intelligence: 45,
    perception: 50,
    willpower: 55,
    fellowship: 60,
} as const;

/** Each characteristic's short code, as the schema initialises it. */
const SHORT_CODES = new Map(CHARACTERISTICS.map((characteristic) => [characteristic.key, characteristic.short]));

/**
 * A DH2 NPC with the given stored skills and the fixed characteristic totals.
 * A skill given without entries is Known (rank 1), so its target is its
 * characteristic's total; one given with entries keeps its ranks on them and has
 * no bare row of its own.
 */
function npc(trainedSkills: Record<string, StoredSkill>): Npc {
    const Dh2Npc = class extends NPCData {
        static gameSystem = 'dh2';
    };
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's TypeDataModel constructor demands (data, options), which the stubbed base ignores; the instance is populated by hand below
    const instance = new (Dh2Npc as unknown as new () => Npc)();
    Object.assign(instance, {
        characteristics: Object.fromEntries(Object.entries(TOTALS).map(([key, total]) => [key, { total, short: SHORT_CODES.get(key) ?? '' }])),
        trainedSkills: Object.fromEntries(
            Object.entries(trainedSkills).map(([key, skill]) => [
                key,
                { name: '', trained: skill.entries === undefined, plus10: false, plus20: false, bonus: 0, ...skill },
            ]),
        ),
        customStats: { enabled: false, skills: {} },
    });
    return instance;
}

/** The row `trainedSkillsList` builds for `key`. */
function row(actor: Npc, key: string): { characteristic: string; target: number } {
    const found = actor.trainedSkillsList.find((entry) => entry.key === key);
    expect(found).toBeDefined();
    return { characteristic: found?.characteristic ?? '', target: found?.target ?? Number.NaN };
}

describe('NPC skill row characteristic (#725)', () => {
    it('a skill with a blank characteristic shows and rolls the catalog one', () => {
        const actor = npc({ dodge: { characteristic: '' } });
        expect(actor.skillRowCharacteristic('dodge')).toBe('agility');
        expect(actor.getSkillTarget('dodge')).toBe(TOTALS.agility);
        expect(row(actor, 'dodge')).toEqual({ characteristic: 'agility', target: TOTALS.agility });
    });

    it('a stored characteristic wins over the catalog, in the label and in the target', () => {
        const actor = npc({ dodge: { characteristic: 'strength' } });
        expect(actor.skillRowCharacteristic('dodge')).toBe('strength');
        expect(row(actor, 'dodge')).toEqual({ characteristic: 'strength', target: TOTALS.strength });
    });

    it('an untrained skill the NPC does not store rolls on the catalog characteristic', () => {
        const actor = npc({});
        expect(actor.skillRowCharacteristic('intimidate')).toBe('strength');
        // DH2 untrained: the characteristic at -20.
        expect(actor.getSkillTarget('intimidate')).toBe(TOTALS.strength - 20);
    });

    it('a skill the catalog does not list falls to perception', () => {
        const actor = npc({ homebrewSkill: { characteristic: '' } });
        expect(row(actor, 'homebrewSkill')).toEqual({ characteristic: 'perception', target: TOTALS.perception });
    });

    describe('specialisation entries', () => {
        const entry = (characteristic: string | undefined): NonNullable<StoredSkill['entries']> => [
            { name: 'Imperium', specialization: 'Imperium', advance: 1, ...(characteristic !== undefined ? { characteristic } : {}) },
        ];

        it('an entry with a blank characteristic rolls on its skill’s, never on nothing', () => {
            const actor = npc({ commonLore: { characteristic: 'fellowship', advance: 0, entries: entry('') } });
            expect(row(actor, 'commonLore:imperium')).toEqual({ characteristic: 'fellowship', target: TOTALS.fellowship });
        });

        it('an entry with no characteristic rolls on its skill’s', () => {
            const actor = npc({ commonLore: { characteristic: 'fellowship', advance: 0, entries: entry(undefined) } });
            expect(row(actor, 'commonLore:imperium')).toEqual({ characteristic: 'fellowship', target: TOTALS.fellowship });
        });

        it('an entry under a blank skill rolls on the catalog characteristic', () => {
            const actor = npc({ commonLore: { characteristic: '', advance: 0, entries: entry('') } });
            expect(row(actor, 'commonLore:imperium')).toEqual({ characteristic: 'intelligence', target: TOTALS.intelligence });
        });

        it('an entry’s own characteristic wins over its skill’s', () => {
            const actor = npc({ commonLore: { characteristic: 'fellowship', advance: 0, entries: entry('willpower') } });
            expect(row(actor, 'commonLore:imperium')).toEqual({ characteristic: 'willpower', target: TOTALS.willpower });
        });
    });

    it('every row is labelled with the characteristic its target was computed on', () => {
        const actor = npc({
            dodge: { characteristic: '' },
            parry: { characteristic: 'agility' },
            awareness: { characteristic: '' },
            commonLore: {
                characteristic: '',
                advance: 0,
                entries: [
                    { name: 'Imperium', specialization: 'Imperium', advance: 1, characteristic: '' },
                    { name: 'War', specialization: 'War', advance: 1, characteristic: 'willpower' },
                ],
            },
        });
        const totals: Record<string, number> = TOTALS;
        const rows = actor.trainedSkillsList;
        expect(rows).toHaveLength(5);
        expect(rows.filter((r) => totals[r.characteristic] !== r.target).map((r) => r.key)).toEqual([]);
    });

    // The sheet's standard skill rows print a short code. It was the catalog's
    // whatever the NPC stored, beside a target computed on the stored one.
    describe('the short code the sheet prints', () => {
        it('is the catalog characteristic’s for a blank stored value', () => {
            const actor = npc({ dodge: { characteristic: '' } });
            expect(actor.skillRowCharacteristicShort('dodge')).toBe('Ag');
            expect(actor.skillRowCharacteristicShort('intimidate')).toBe('S');
        });

        it('follows a stored characteristic, as the target does', () => {
            const actor = npc({ dodge: { characteristic: 'strength' } });
            expect(actor.skillRowCharacteristicShort('dodge')).toBe('S');
            expect(actor.getSkillTarget('dodge')).toBe(TOTALS.strength);
        });

        it('follows a specialisation entry’s own characteristic', () => {
            const entry = { name: 'Imperium', specialization: 'Imperium', advance: 1, characteristic: 'willpower' };
            const actor = npc({ commonLore: { characteristic: 'fellowship', advance: 0, entries: [entry] } });
            expect(actor.skillRowCharacteristicShort('commonLore', entry)).toBe('WP');
            expect(actor.skillRowCharacteristicShort('commonLore')).toBe('Fel');
        });

        it('names the same characteristic the target was computed on, for every characteristic', () => {
            const disagreeing = Object.entries(TOTALS)
                .filter(([key, total]) => {
                    const actor = npc({ dodge: { characteristic: key } });
                    const labelled = actor.getCharacteristic(actor.skillRowCharacteristicShort('dodge'));
                    return labelled?.total !== total || actor.getSkillTarget('dodge') !== total;
                })
                .map(([key]) => key);
            expect(disagreeing).toEqual([]);
        });

        it('returns a stored value that names no characteristic as stored, beside its target of 0', () => {
            const actor = npc({ dodge: { characteristic: 'luck' } });
            expect(actor.skillRowCharacteristicShort('dodge')).toBe('luck');
            expect(actor.getSkillTarget('dodge')).toBe(0);
        });
    });
});
