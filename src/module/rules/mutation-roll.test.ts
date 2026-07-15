import { describe, expect, it } from 'vitest';
import { type MutationEntry, type MutationResult, buildEntries, rollMutation, trackRange } from './mutation-roll';

const PACK = 'Compendium.wh40k-rpg.dh2-core-items-mutations.Item';

/** Representative slice of the real Mutations table (minor boundary + major-only rows + top). */
const entries: MutationEntry[] = [
    { range: [1, 6], uuid: `${PACK}.bestial`, name: 'Bestial Hide', category: 'minor', visible: true, effect: '<p>hide</p>' },
    { range: [26, 30], uuid: `${PACK}.deathsight`, name: 'Deathsight', category: 'minor', visible: false, effect: '<p>sight</p>' },
    { range: [50, 54], uuid: `${PACK}.wings`, name: 'Wings', category: 'minor', visible: true, effect: '<p>wings</p>' },
    { range: [55, 60], uuid: `${PACK}.serpent`, name: 'Serpentine Tail', category: 'major', visible: true, effect: '<p>tail</p>' },
    { range: [70, 77], uuid: `${PACK}.witch`, name: 'Witch-Curse', category: 'major', visible: false, effect: '<p>curse</p>' },
    { range: [100, 100], uuid: `${PACK}.manifest`, name: 'The Warp Made Manifest', category: 'major', visible: true, effect: '<p>manifest</p>' },
];

/** An `Rng` (float in [0,1)) that yields the given d100 value through `rollD100`. */
const rngForRoll = (roll: number) => (): number => (roll - 0.5) / 100;

describe('trackRange', () => {
    it('bounds the minor track at the last minor row and the major track at the full table', () => {
        expect(trackRange(entries, 'minor')).toEqual({ min: 1, max: 54 });
        expect(trackRange(entries, 'major')).toEqual({ min: 1, max: 100 });
    });

    it('falls back to [1, 1] when there are no entries', () => {
        expect(trackRange([], 'minor')).toEqual({ min: 1, max: 1 });
        expect(trackRange([], 'major')).toEqual({ min: 1, max: 1 });
    });
});

describe('rollMutation', () => {
    it('resolves the row containing the rolled value on the requested track', () => {
        expect(rollMutation(entries, 'minor', rngForRoll(3)).mutation?.name).toBe('Bestial Hide');
        expect(rollMutation(entries, 'major', rngForRoll(54)).mutation?.name).toBe('Wings');
        expect(rollMutation(entries, 'major', rngForRoll(75)).mutation?.name).toBe('Witch-Curse');
        expect(rollMutation(entries, 'major', rngForRoll(100)).mutation?.name).toBe('The Warp Made Manifest');
    });

    it('clamps a high roll down to the minor track ceiling so major-only rows are unreachable', () => {
        const clamped = rollMutation(entries, 'minor', rngForRoll(99));
        expect(clamped.roll).toBe(54);
        expect(clamped.mutation?.name).toBe('Wings');

        // The same raw roll on the major track reaches the top of the table.
        expect(rollMutation(entries, 'major', rngForRoll(99)).roll).toBe(99);
    });

    it('keeps every minor roll inside the 1–54 band across the RNG range', () => {
        for (let i = 0; i < 200; i += 1) {
            const rng = (): number => i / 200;
            const { roll } = rollMutation(entries, 'minor', rng);
            expect(roll).toBeGreaterThanOrEqual(1);
            expect(roll).toBeLessThanOrEqual(54);
        }
    });

    it('reports a null mutation when the clamped value lands in a table gap', () => {
        // 61–69 is absent from this representative slice; a full table has no gap.
        const { roll, mutation } = rollMutation(entries, 'major', rngForRoll(65));
        expect(roll).toBe(65);
        expect(mutation).toBeNull();
    });
});

describe('buildEntries', () => {
    const items: Record<string, { name: string; system: { category: string; visible: boolean; effect: string } }> = {
        [`${PACK}.wings`]: { name: 'Wings', system: { category: 'minor', visible: true, effect: '<p>wings</p>' } },
        [`${PACK}.bestial`]: { name: 'Bestial Hide', system: { category: 'minor', visible: true, effect: '<p>hide</p>' } },
        [`${PACK}.witch`]: { name: '', system: { category: 'major', visible: false, effect: '<p>curse</p>' } },
    };
    const resolve = async (uuid: string): Promise<(typeof items)[string] | null> => {
        await Promise.resolve();
        return items[uuid] ?? null;
    };

    it('projects results to entries, sorts by range start, and drops unresolved/refless rows', async () => {
        const results: MutationResult[] = [
            { range: [50, 54], documentUuid: `${PACK}.wings`, name: 'Wings' },
            { range: [1, 6], documentUuid: `${PACK}.bestial`, name: 'Bestial Hide' },
            { range: [70, 77], documentUuid: `${PACK}.witch`, name: 'Witch-Curse (fallback)' },
            { range: [90, 92], documentUuid: `${PACK}.missing`, name: 'Absent Item' },
            { range: [93, 94], documentUuid: null, name: 'No Reference' },
        ];

        const built = await buildEntries(results, resolve);

        expect(built.map((e) => e.name)).toEqual(['Bestial Hide', 'Wings', 'Witch-Curse (fallback)']);
        expect(built.map((e) => e.range[0])).toEqual([1, 50, 70]);
        // Name falls back to the result's name when the item has none.
        expect(built[2]?.name).toBe('Witch-Curse (fallback)');
        expect(built[2]?.category).toBe('major');
        expect(built[2]?.visible).toBe(false);
        expect(built[0]?.effect).toBe('<p>hide</p>');
    });

    it('defaults an unrecognised category to minor', async () => {
        const weird = { name: 'Weird', system: { category: 'malignancy', visible: true, effect: '' } };
        const built = await buildEntries([{ range: [1, 6], documentUuid: `${PACK}.weird`, name: 'Weird' }], async () => Promise.resolve(weird));
        expect(built[0]?.category).toBe('minor');
    });
});
