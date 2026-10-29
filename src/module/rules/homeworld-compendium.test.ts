import { describe, expect, it, vi } from 'vitest';
import { packMetadata } from '../testing/pack-metadata.ts';
import {
    type HomeworldMechanics,
    type HomeworldPack,
    parseEmperorsBlessingMin,
    parseWoundsFormula,
    readHomeworldMechanics,
    readLineHomeworlds,
} from './homeworld-compendium.ts';

/**
 * Coverage for the compendium-sourced homeworld mechanics reader (#338).
 *
 * Pins the parsers (wounds formula, Emperor's Blessing breakpoint), the full
 * projection from an `originPath` document to a {@link HomeworldMechanics}
 * view-model (including the characteristic-mod sign split and every named
 * bonus), and the per-line reader that selects home-world packs by their flags.
 */

/* -------------------------------------------- */
/*  Pack stub                                    */
/* -------------------------------------------- */

interface RawDoc {
    name: string;
    system: {
        identifier?: string;
        modifiers?: { characteristics?: Record<string, number> };
        grants?: {
            fateThreshold?: number;
            woundsFormula?: string;
            aptitudes?: string[];
            specialAbilities?: { name: string; description: string }[];
        };
        notes?: { dh2?: string };
    };
}

/** A home-world pack named `name`, flagged on `line`, holding `docs`. */
function homeworldPack(docs: RawDoc[], name = 'dh2-homeworlds-a', line = 'dh2', category = 'origins-homeworlds'): HomeworldPack {
    return { metadata: packMetadata(name, line, category), getDocuments: vi.fn<() => Promise<RawDoc[]>>().mockResolvedValue(docs) };
}

/** Minimal fixtures matching the real compendium document shape. */
const PACK_A_DOCS: RawDoc[] = [
    {
        name: 'Agri-World',
        system: {
            identifier: 'agri-world',
            modifiers: { characteristics: { fellowship: 5, strength: 5, agility: -5 } },
            grants: {
                fateThreshold: 2,
                woundsFormula: '8+1d5',
                aptitudes: ['Strength'],
                specialAbilities: [{ name: 'Strength from the Land', description: 'Fixture text: starts with a charge talent.' }],
            },
            notes: { dh2: "Emperor's Blessing: roll of 7+ on 1d10 → +1 Fate." },
        },
    },
    {
        name: 'Feudal World',
        system: {
            identifier: 'feudal-world',
            modifiers: { characteristics: { perception: 5, weaponSkill: 5, intelligence: -5 } },
            grants: {
                fateThreshold: 3,
                woundsFormula: '9+1d5',
                aptitudes: ['Weapon Skill'],
                specialAbilities: [
                    { name: 'At Home in Armour', description: 'Fixture text: armour never caps Agility.' },
                    { name: 'Second Fixture Bonus', description: 'Fixture text: a second named bonus.' },
                ],
            },
            notes: { dh2: "Emperor's Blessing: roll of 6+ on 1d10 → +1 Fate." },
        },
    },
];

const DEATH_WORLD: RawDoc = {
    name: 'Death World',
    system: {
        identifier: 'death-world',
        modifiers: { characteristics: { agility: 5, perception: 5, fellowship: -5 } },
        grants: {
            fateThreshold: 2,
            woundsFormula: '9+1d5',
            aptitudes: ['Fieldcraft'],
            specialAbilities: [{ name: "Survivor's Paranoia", description: 'Fixture text: no bonus for attackers while Surprised.' }],
        },
        notes: { dh2: "Emperor's Blessing: roll of 5+ on 1d10 → +1 Fate." },
    },
};

/* -------------------------------------------- */
/*  Parser units                                 */
/* -------------------------------------------- */

describe('parseWoundsFormula', () => {
    it('parses an N+Md5 expression into flat / dice / faces', () => {
        expect(parseWoundsFormula('8+1d5')).toEqual({ flat: 8, dice: 1, faces: 5 });
        expect(parseWoundsFormula('10+1d5')).toEqual({ flat: 10, dice: 1, faces: 5 });
        expect(parseWoundsFormula('  7+1d5 ')).toEqual({ flat: 7, dice: 1, faces: 5 });
    });

    it('returns null for a non-matching string', () => {
        expect(parseWoundsFormula('')).toBeNull();
        expect(parseWoundsFormula('8 + 1d5')).toBeNull();
        expect(parseWoundsFormula('1d5')).toBeNull();
        expect(parseWoundsFormula('eight')).toBeNull();
    });
});

describe('parseEmperorsBlessingMin', () => {
    it('extracts the breakpoint from a blessing note', () => {
        expect(parseEmperorsBlessingMin("Emperor's Blessing: On a roll of 7+ on 1d10, ...")).toBe(7);
        expect(parseEmperorsBlessingMin('On a roll of 5+ on 1d10')).toBe(5);
        expect(parseEmperorsBlessingMin('roll of 10+ on 1d10')).toBe(10);
    });

    it('returns null when no breakpoint is present', () => {
        expect(parseEmperorsBlessingMin('')).toBeNull();
        expect(parseEmperorsBlessingMin('no breakpoint here')).toBeNull();
    });
});

/* -------------------------------------------- */
/*  Reader                                       */
/* -------------------------------------------- */

describe('readHomeworldMechanics', () => {
    it('returns an empty Map when the pack lacks getDocuments', async () => {
        // A pack present but without a usable getDocuments (e.g. disabled/locked) — no throw, empty Map.
        const map = await readHomeworldMechanics({ metadata: packMetadata('locked', 'dh2', 'origins-homeworlds') });
        expect(map.size).toBe(0);
    });

    it('returns an empty Map (no uncaught error) when getDocuments throws', async () => {
        // A pack whose documentClass isn't ready throws inside getDocuments
        // ("...reading 'database'"); the dialog must degrade to an empty grid, not crash.
        const failing: HomeworldPack = {
            metadata: packMetadata('failing', 'dh2', 'origins-homeworlds'),
            getDocuments: vi.fn<() => Promise<RawDoc[]>>().mockRejectedValue(new Error("Cannot read properties of undefined (reading 'database')")),
        };
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const map = await readHomeworldMechanics(failing);
        expect(map.size).toBe(0);
        vi.restoreAllMocks();
    });

    it('keys each projected mechanics by the document identifier, skipping documents without one', async () => {
        const map = await readHomeworldMechanics(homeworldPack([...PACK_A_DOCS, { name: 'Orphan', system: {} }]));
        expect([...map.keys()].sort()).toEqual(['agri-world', 'feudal-world']);
    });

    it('projects Agri-World to the exact values the dialog shows', async () => {
        const agri = (await readHomeworldMechanics(homeworldPack(PACK_A_DOCS))).get('agri-world');
        expect(agri).toEqual({
            id: 'agri-world',
            label: 'Agri-World',
            charModsPositive: ['fellowship', 'strength'],
            charModsNegative: ['agility'],
            fateBase: 2,
            emperorsBlessingMin: 7,
            aptitudes: ['Strength'],
            abilities: [{ name: 'Strength from the Land', description: 'Fixture text: starts with a charge talent.' }],
            woundsFlat: 8,
            woundsDice: 1,
            woundsFaces: 5,
        } satisfies HomeworldMechanics);
    });

    it('splits characteristic mods by sign in document order, and keeps every named bonus', async () => {
        const feudal = (await readHomeworldMechanics(homeworldPack(PACK_A_DOCS))).get('feudal-world');
        expect(feudal?.charModsPositive).toEqual(['perception', 'weaponSkill']);
        expect(feudal?.charModsNegative).toEqual(['intelligence']);
        expect(feudal?.fateBase).toBe(3);
        expect(feudal?.emperorsBlessingMin).toBe(6);
        expect(feudal?.abilities.map((a) => a.name)).toEqual(['At Home in Armour', 'Second Fixture Bonus']);
    });

    it('falls back gracefully when wounds / blessing strings are malformed', async () => {
        const map = await readHomeworldMechanics(
            homeworldPack([
                {
                    name: 'Broken',
                    system: { identifier: 'broken', grants: { woundsFormula: 'bad', aptitudes: [], specialAbilities: [] }, notes: { dh2: 'no breakpoint' } },
                },
            ]),
        );
        const broken = map.get('broken');
        expect(broken?.woundsFlat).toBe(0);
        expect(broken?.woundsDice).toBe(1);
        expect(broken?.woundsFaces).toBe(5);
        expect(broken?.emperorsBlessingMin).toBe(0);
        expect(broken?.abilities).toEqual([]);
    });
});

describe('readLineHomeworlds', () => {
    it("reads every one of the line's home-world packs, by flags, one group per pack under its label", async () => {
        const packs = [
            homeworldPack(PACK_A_DOCS, 'pack-a'),
            homeworldPack([DEATH_WORLD], 'pack-b'),
            homeworldPack([DEATH_WORLD], 'other-line', 'rt'),
            homeworldPack([DEATH_WORLD], 'backgrounds', 'dh2', 'origins-backgrounds'),
            homeworldPack([], 'empty'),
        ];
        const groups = await readLineHomeworlds('dh2', packs);
        expect(groups.map((group) => group.label)).toEqual(['pack-a', 'pack-b']);
        expect(groups.map((group) => group.homeworlds.map((h) => h.id))).toEqual([['agri-world', 'feudal-world'], ['death-world']]);
    });

    it('returns no groups for a line with no home-world packs', async () => {
        expect(await readLineHomeworlds('bc', [homeworldPack(PACK_A_DOCS)])).toEqual([]);
    });
});
