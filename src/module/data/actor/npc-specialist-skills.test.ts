import { afterAll, describe, expect, it } from 'vitest';
import { installFoundryDataStub } from '../../testing/foundry-data-stub.ts';
import { CHARACTERISTICS } from '../shared/characteristics.ts';

/**
 * An NPC's stored specialisation rows are listed for the sheet and can be found
 * by a roll (#725).
 *
 * The sheet's specialist panel was fed an empty list and the roll had no entry
 * path, so an imported NPC's `trainedSkills[<skill>].entries` were stored and
 * never shown or rolled. `specialistSkillGroups` is the list the panel renders,
 * and `findSkillEntry` reads back the position its roll button carries.
 *
 * `npc.ts` needs only `foundry.abstract` + `foundry.data.fields` at module
 * evaluation, so the shared Foundry data stub is installed before its import.
 */
afterAll(installFoundryDataStub());

const { default: NPCData } = await import('./npc.ts');

type Npc = InstanceType<typeof NPCData>;

/** One stored specialisation entry. */
interface StoredEntry {
    name: string;
    specialization?: string;
    characteristic?: string;
    advance: number;
    bonus?: number;
}

/** One stored skill row: what the test sets, the rest as the schema initialises it. */
interface StoredSkill {
    name?: string;
    characteristic?: string;
    advance?: number;
    bonus?: number;
    entries?: StoredEntry[];
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

/** A DH2 NPC with the given stored skills and the fixed characteristic totals. */
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
                { name: '', characteristic: '', advance: 0, trained: false, plus10: false, plus20: false, bonus: 0, ...skill },
            ]),
        ),
        customStats: { enabled: false, skills: {} },
    });
    return instance;
}

/** The group `specialistSkillGroups` builds for `key`. */
function group(actor: Npc, key: string): Npc['specialistSkillGroups'][number] {
    const found = actor.specialistSkillGroups.find((entry) => entry.key === key);
    if (found === undefined) throw new Error(`no specialist group for ${key}`);
    return found;
}

/** What a panel row shows and rolls. */
function shown(rows: Npc['specialistSkillGroups'][number]['rows']): Array<{ index: number | null; name: string; characteristic: string; target: number }> {
    return rows.map(({ index, name, characteristic, target }) => ({ index, name, characteristic, target }));
}

describe('NPCData.skillEntryName (#725)', () => {
    it('is the specialisation when the entry has one', () => {
        expect(NPCData.skillEntryName({ name: 'Common Lore', specialization: 'Imperium', advance: 1 })).toBe('Imperium');
    });

    it('is the name when the specialisation is blank or absent', () => {
        expect(NPCData.skillEntryName({ name: 'Common Lore', specialization: '', advance: 1 })).toBe('Common Lore');
        expect(NPCData.skillEntryName({ name: 'Imperium', advance: 1 })).toBe('Imperium');
    });
});

describe('NPCData.findSkillEntry (#725)', () => {
    const actor = npc({
        commonLore: {
            name: 'Common Lore',
            entries: [
                { name: 'Imperium', specialization: 'Imperium', advance: 1 },
                { name: 'Tech', specialization: 'Tech', advance: 2 },
                { name: 'Common Lore', specialization: '', advance: 3 },
            ],
        },
        dodge: { advance: 1 },
    });

    it('finds an entry by its position, as a number or as the digits a roll button carries', () => {
        expect(actor.findSkillEntry('commonLore', 1)?.specialization).toBe('Tech');
        expect(actor.findSkillEntry('commonLore', '1')?.specialization).toBe('Tech');
        expect(actor.findSkillEntry('commonLore', 0)?.specialization).toBe('Imperium');
        expect(actor.findSkillEntry('commonLore', '0')?.specialization).toBe('Imperium');
    });

    it('finds an entry by its name without regard to case', () => {
        expect(actor.findSkillEntry('commonLore', 'tech')?.advance).toBe(2);
        expect(actor.findSkillEntry('commonLore', 'IMPERIUM')?.advance).toBe(1);
        // A blank specialisation is found by the entry's name.
        expect(actor.findSkillEntry('commonLore', 'common lore')?.advance).toBe(3);
    });

    it('finds nothing for a blank, absent, out-of-range or unknown speciality', () => {
        expect(actor.findSkillEntry('commonLore', '')).toBeUndefined();
        expect(actor.findSkillEntry('commonLore', undefined)).toBeUndefined();
        expect(actor.findSkillEntry('commonLore', 3)).toBeUndefined();
        expect(actor.findSkillEntry('commonLore', '7')).toBeUndefined();
        expect(actor.findSkillEntry('commonLore', 0.5)).toBeUndefined();
        expect(actor.findSkillEntry('commonLore', 'War')).toBeUndefined();
    });

    it('finds nothing on a skill with no entries or a skill the NPC does not store', () => {
        expect(actor.findSkillEntry('dodge', 0)).toBeUndefined();
        expect(actor.findSkillEntry('dodge', 'Dodge')).toBeUndefined();
        expect(actor.findSkillEntry('forbiddenLore', 0)).toBeUndefined();
    });
});

describe('NPCData.skillEntryTest (#725)', () => {
    const actor = npc({
        commonLore: {
            name: 'Common Lore',
            advance: 1,
            entries: [
                { name: 'Imperium', specialization: 'Imperium', advance: 1 },
                { name: 'Tech', specialization: 'Tech', advance: 3, bonus: 5 },
                { name: 'War', specialization: 'War', characteristic: 'fellowship', advance: 2 },
                { name: '', specialization: '', advance: 4 },
            ],
        },
        dodge: { advance: 1 },
    });

    it("is the entry's name, its own rank, and the target that rank and bonus give", () => {
        expect(actor.skillEntryTest('commonLore', '1')).toEqual({
            name: 'Tech',
            current: TOTALS.intelligence + 20 + 5,
            rank: 3,
            characteristic: 'intelligence',
        });
        // Not the skill's own rank 1: the entry's.
        expect(actor.skillEntryTest('commonLore', 0)?.current).toBe(TOTALS.intelligence);
        expect(actor.skillEntryTest('commonLore', 0)?.rank).toBe(1);
    });

    it('rolls on the characteristic the entry stores, and names it', () => {
        expect(actor.skillEntryTest('commonLore', 'war')).toEqual({
            name: 'War',
            current: TOTALS.fellowship + 10,
            rank: 2,
            characteristic: 'fellowship',
        });
    });

    it("is the same target the entry's row shows", () => {
        const rows = group(actor, 'commonLore').rows.filter((row) => row.index !== null);
        expect(rows).toHaveLength(3);
        for (const row of rows) {
            expect(actor.skillEntryTest('commonLore', String(row.index))?.current).toBe(row.target);
            expect(actor.skillEntryTest('commonLore', String(row.index))?.rank).toBe(row.rank);
        }
    });

    it('is undefined for no speciality, an unknown one, a nameless entry, or a skill with no entries', () => {
        expect(actor.skillEntryTest('commonLore', undefined)).toBeUndefined();
        expect(actor.skillEntryTest('commonLore', '')).toBeUndefined();
        expect(actor.skillEntryTest('commonLore', 'Koronus Expanse')).toBeUndefined();
        expect(actor.skillEntryTest('commonLore', 3)).toBeUndefined();
        expect(actor.skillEntryTest('dodge', 0)).toBeUndefined();
    });
});

describe('NPCData.specialistSkillGroups (#725)', () => {
    it('lists a skill with entries as one group, a row per entry, each at its stored position', () => {
        const actor = npc({
            commonLore: {
                name: 'Common Lore',
                entries: [
                    { name: 'Imperium', specialization: 'Imperium', advance: 1 },
                    { name: 'Tech', specialization: 'Tech', advance: 2, bonus: 5 },
                ],
            },
        });
        const lore = group(actor, 'commonLore');
        expect(lore.label).toBe('Common Lore');
        expect(lore.characteristic).toBe('Int');
        expect(shown(lore.rows)).toEqual([
            { index: 0, name: 'Imperium', characteristic: 'Int', target: TOTALS.intelligence },
            // Trained (+10) with a +5 bonus.
            { index: 1, name: 'Tech', characteristic: 'Int', target: TOTALS.intelligence + 15 },
        ]);
        expect(
            lore.rows.map((entry) => ({ rank: entry.rank, trained: entry.trained, plus10: entry.plus10, plus20: entry.plus20, bonus: entry.bonus })),
        ).toEqual([
            { rank: 1, trained: true, plus10: false, plus20: false, bonus: 0 },
            { rank: 2, trained: true, plus10: true, plus20: false, bonus: 5 },
        ]);
    });

    it("a row's position reads back the entry it was built from", () => {
        const actor = npc({
            commonLore: {
                name: 'Common Lore',
                entries: [
                    { name: '', specialization: '', advance: 1 },
                    { name: 'Tech', specialization: 'Tech', advance: 2 },
                ],
            },
        });
        const rows = group(actor, 'commonLore').rows;
        // The blank entry has no row, and the row after it keeps its stored position.
        expect(shown(rows)).toEqual([{ index: 1, name: 'Tech', characteristic: 'Int', target: TOTALS.intelligence + 10 }]);
        expect(actor.findSkillEntry('commonLore', rows.at(0)?.index ?? undefined)?.specialization).toBe('Tech');
    });

    it('an entry rolls on its own characteristic and the row is labelled with it', () => {
        const actor = npc({
            commonLore: { name: 'Common Lore', entries: [{ name: 'Imperium', specialization: 'Imperium', characteristic: 'fellowship', advance: 1 }] },
        });
        const lore = group(actor, 'commonLore');
        expect(lore.characteristic).toBe('Int');
        expect(shown(lore.rows)).toEqual([{ index: 0, name: 'Imperium', characteristic: 'Fel', target: TOTALS.fellowship }]);
    });

    it('a specialist skill stored flat is a group of its own row, named by the bracket', () => {
        const actor = npc({ commonLore: { name: 'Common Lore (Imperium)', advance: 2 } });
        const lore = group(actor, 'commonLore');
        expect(lore.label).toBe('Common Lore');
        expect(shown(lore.rows)).toEqual([{ index: null, name: 'Imperium', characteristic: 'Int', target: TOTALS.intelligence + 10 }]);
        expect(lore.rows.at(0)?.target).toBe(actor.getSkillTarget('commonLore'));
    });

    it('a skill ranked on its own row and on entries lists its own row first', () => {
        const actor = npc({
            commonLore: { name: 'Common Lore', advance: 1, entries: [{ name: 'Tech', specialization: 'Tech', advance: 3 }] },
        });
        expect(shown(group(actor, 'commonLore').rows)).toEqual([
            { index: null, name: 'Common Lore', characteristic: 'Int', target: TOTALS.intelligence },
            { index: 0, name: 'Tech', characteristic: 'Int', target: TOTALS.intelligence + 20 },
        ]);
    });

    it('a skill whose ranks all live on its entries has no row of its own', () => {
        const actor = npc({ commonLore: { name: 'Common Lore', advance: 0, entries: [{ name: 'Tech', specialization: 'Tech', advance: 1 }] } });
        expect(group(actor, 'commonLore').rows.map((entry) => entry.index)).toEqual([0]);
    });

    it('an entry with a blank specialisation is listed under its name', () => {
        const actor = npc({ commonLore: { name: 'Common Lore', entries: [{ name: 'Common Lore', specialization: '', advance: 1 }] } });
        expect(shown(group(actor, 'commonLore').rows)).toEqual([{ index: 0, name: 'Common Lore', characteristic: 'Int', target: TOTALS.intelligence }]);
    });

    it('a standard skill with no entries stays in the basic grid only', () => {
        const actor = npc({ dodge: { advance: 1 }, awareness: { advance: 2 } });
        expect(actor.specialistSkillGroups).toEqual([]);
    });

    it('a standard skill with entries lists the entries and not its own row', () => {
        const actor = npc({ awareness: { name: 'Awareness', advance: 1, entries: [{ name: 'Sight', specialization: 'Sight', advance: 2 }] } });
        const awareness = group(actor, 'awareness');
        expect(awareness.label).toBe('Awareness');
        expect(awareness.characteristic).toBe('Per');
        expect(shown(awareness.rows)).toEqual([{ index: 0, name: 'Sight', characteristic: 'Per', target: TOTALS.perception + 10 }]);
    });

    it('a skill the catalog does not know is listed under its stored name', () => {
        const actor = npc({ runeLore: { name: 'Rune Lore', characteristic: 'willpower', advance: 1 } });
        const custom = group(actor, 'runeLore');
        expect(custom.label).toBe('Rune Lore');
        expect(custom.characteristic).toBe('WP');
        expect(shown(custom.rows)).toEqual([{ index: null, name: 'Rune Lore', characteristic: 'WP', target: TOTALS.willpower }]);
    });

    it('a skill with nothing to show has no group', () => {
        const actor = npc({ commonLore: { name: 'Common Lore', advance: 0, entries: [{ name: '', specialization: '', advance: 1 }] } });
        expect(actor.specialistSkillGroups).toEqual([]);
    });

    it('groups are ordered by label', () => {
        const actor = npc({
            scholasticLore: { name: 'Scholastic Lore (Legend)', advance: 1 },
            commonLore: { name: 'Common Lore (Imperium)', advance: 1 },
            forbiddenLore: { name: 'Forbidden Lore (Warp)', advance: 1 },
        });
        expect(actor.specialistSkillGroups.map((entry) => entry.label)).toEqual(['Common Lore', 'Forbidden Lore', 'Scholastic Lore']);
    });

    it("every entry row's target is the one the flat list computes for the same entry", () => {
        const actor = npc({
            commonLore: {
                name: 'Common Lore',
                entries: [
                    { name: 'Imperium', specialization: 'Imperium', advance: 1 },
                    { name: 'Tech', specialization: 'Tech', characteristic: 'fellowship', advance: 4, bonus: 5 },
                ],
            },
        });
        const flat = new Map(actor.trainedSkillsList.map((entry) => [entry.name, entry.target]));
        for (const entry of group(actor, 'commonLore').rows) {
            expect(flat.get(`Common Lore (${entry.name})`)).toBe(entry.target);
        }
        expect(flat.get('Common Lore (Tech)')).toBe(TOTALS.fellowship + 35);
    });
});

describe('NPCData.trainedSkillsList entry names (#725)', () => {
    it('an entry with a blank specialisation is kept and carries the skill name once', () => {
        const actor = npc({
            commonLore: {
                name: 'Common Lore',
                entries: [
                    { name: 'Common Lore', specialization: '', advance: 1 },
                    { name: 'Imperium', specialization: 'Imperium', advance: 2 },
                ],
            },
        });
        expect(actor.trainedSkillsList.map((entry) => ({ name: entry.name, target: entry.target }))).toEqual([
            { name: 'Common Lore', target: TOTALS.intelligence },
            { name: 'Common Lore (Imperium)', target: TOTALS.intelligence + 10 },
        ]);
    });

    it('an entry with neither a specialisation nor a name has no row', () => {
        const actor = npc({ commonLore: { name: 'Common Lore', entries: [{ name: '', specialization: '', advance: 1 }] } });
        expect(actor.trainedSkillsList).toEqual([]);
    });
});

describe('NPCData.statBlockSkills (#725)', () => {
    it('prints a row per skill and per specialisation, each with what its rank adds', () => {
        const actor = npc({
            awareness: { name: 'Awareness', advance: 1 },
            dodge: { name: 'Dodge', advance: 2 },
            commonLore: {
                name: 'Common Lore',
                entries: [
                    { name: 'Imperium', specialization: 'Imperium', advance: 3 },
                    { name: 'War', specialization: 'War', advance: 4 },
                ],
            },
        });
        expect(actor.statBlockSkills).toEqual(['Awareness', 'Common Lore (Imperium) +20', 'Common Lore (War) +30', 'Dodge +10']);
    });

    it('adds a stored bonus to what the rank adds, and prints a penalty with its sign', () => {
        const actor = npc({
            awareness: { name: 'Awareness', advance: 1, bonus: -10 },
            dodge: { name: 'Dodge', advance: 3, bonus: 5 },
            commonLore: { name: 'Common Lore', entries: [{ name: 'Tech', specialization: 'Tech', advance: 2, bonus: -10 }] },
        });
        expect(actor.statBlockSkills).toEqual(['Awareness -10', 'Common Lore (Tech)', 'Dodge +25']);
    });

    it('prints an unranked row by its name, with only the bonus it stores', () => {
        const actor = npc({ awareness: { name: 'Awareness', advance: 0 }, dodge: { name: 'Dodge', advance: 0, bonus: 5 } });
        expect(actor.statBlockSkills).toEqual(['Awareness', 'Dodge +5']);
    });

    it('is empty for an NPC with no skills', () => {
        expect(npc({}).statBlockSkills).toEqual([]);
    });
});
