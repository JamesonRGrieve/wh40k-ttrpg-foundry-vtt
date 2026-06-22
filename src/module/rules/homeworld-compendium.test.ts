import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseEmperorsBlessingMin, parseWoundsFormula, readHomeworldMechanics, type HomeworldMechanics } from './homeworld-compendium.ts';

/**
 * Coverage for the compendium-sourced homeworld mechanics reader (#338).
 *
 * Pins the parsers (wounds formula, Emperor's Blessing breakpoint) and the
 * full projection from an `originPath` document to a {@link HomeworldMechanics}
 * view-model, including the characteristic-mod sign split. The fixtures mirror
 * the real compendium documents so the parsed values equal the values the GM
 * info dialogs used to hardcode — a regression here is a display drift.
 *
 * `game.packs` is a framework global, stubbed per-test.
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
interface FakePack {
    getDocuments?: () => Promise<RawDoc[]>;
}
interface PacksStub {
    get: (id: string) => FakePack | undefined;
}
interface GameStub {
    packs: PacksStub;
}
interface GlobalShim {
    game?: GameStub | undefined;
}

const G = globalThis as GlobalShim;
const ORIGINAL_GAME = G.game;

afterEach(() => {
    G.game = ORIGINAL_GAME;
});

function installPack(packId: string, docs: RawDoc[]): void {
    const getDocuments = vi.fn<() => Promise<RawDoc[]>>().mockResolvedValue(docs);
    G.game = {
        packs: {
            get: (id) => (id === packId ? { getDocuments } : undefined),
        },
    };
}

/** Minimal fixtures matching the real compendium document shape. */
const WITHIN_DOCS: RawDoc[] = [
    {
        name: 'Agri-World',
        system: {
            identifier: 'agri-world',
            modifiers: { characteristics: { fellowship: 5, strength: 5, agility: -5 } },
            grants: {
                fateThreshold: 2,
                woundsFormula: '8+1d5',
                aptitudes: ['Strength'],
                specialAbilities: [{ name: 'Strength from the Land', description: 'An agri-world character starts with the Brutal Charge (2) trait.' }],
            },
            notes: { dh2: "Emperor's Blessing: On a roll of 7+ on 1d10, the character begins with an extra Fate Point." },
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
                    {
                        name: 'At Home in Armour',
                        description: 'A feudal world character ignores the maximum Agility value imposed by any armour he is wearing.',
                    },
                ],
            },
            notes: { dh2: "Emperor's Blessing: On a roll of 6+ on 1d10, the character begins with an extra Fate Point." },
        },
    },
];

const BEYOND_DAEMON: RawDoc = {
    name: 'Daemon World',
    system: {
        identifier: 'daemon-world',
        modifiers: { characteristics: { willpower: 5, perception: 5, fellowship: -5 } },
        grants: {
            fateThreshold: 3,
            woundsFormula: '7+1d5',
            aptitudes: ['Willpower'],
            specialAbilities: [{ name: 'Touched by the Warp', description: 'A daemon world native begins with one rank in the Psyniscience skill.' }],
        },
        notes: { dh2: "Emperor's Blessing: On a roll of 4+ on 1d10, the character begins with an extra Fate Point." },
    },
};

const WITHOUT_DEATH: RawDoc = {
    name: 'Death World',
    system: {
        identifier: 'death-world',
        modifiers: { characteristics: { agility: 5, perception: 5, fellowship: -5 } },
        grants: {
            fateThreshold: 2,
            woundsFormula: '9+1d5',
            aptitudes: ['Fieldcraft'],
            specialAbilities: [
                {
                    name: "Survivor's Paranoia",
                    description: 'While a death world character is Surprised, non-Surprised attackers do not gain the normal +30 bonus.',
                },
            ],
        },
        notes: { dh2: "Emperor's Blessing: On a roll of 5+ on 1d10, the character begins with an extra Fate Point." },
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
    it('returns an empty Map when the pack is absent', async () => {
        G.game = { packs: { get: () => undefined } };
        const map = await readHomeworldMechanics('wh40k-rpg.dh2-within-origins-homeworlds');
        expect(map.size).toBe(0);
    });

    it('returns an empty Map when the pack lacks getDocuments', async () => {
        // A pack object present but without a usable getDocuments (e.g. disabled/locked) — no throw, empty Map.
        const emptyPack: FakePack = {};
        G.game = { packs: { get: () => emptyPack } };
        const map = await readHomeworldMechanics('wh40k-rpg.dh2-beyond-origins-homeworlds');
        expect(map.size).toBe(0);
    });

    it('returns an empty Map (no uncaught error) when getDocuments throws', async () => {
        // A pack whose documentClass isn't ready throws inside getDocuments
        // ("...reading 'database'"); the dialog must degrade to an empty grid, not crash.
        const failingPack: FakePack = {
            getDocuments: vi.fn<() => Promise<RawDoc[]>>().mockRejectedValue(new Error("Cannot read properties of undefined (reading 'database')")),
        };
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        G.game = { packs: { get: () => failingPack } };
        const map = await readHomeworldMechanics('wh40k-rpg.dh2-within-origins-homeworlds');
        expect(map.size).toBe(0);
        vi.restoreAllMocks();
    });

    it('keys each projected mechanics by the document identifier', async () => {
        installPack('wh40k-rpg.dh2-within-origins-homeworlds', WITHIN_DOCS);
        const map = await readHomeworldMechanics('wh40k-rpg.dh2-within-origins-homeworlds');
        expect([...map.keys()].sort()).toEqual(['agri-world', 'feudal-world']);
    });

    it('skips documents without an identifier', async () => {
        installPack('wh40k-rpg.dh2-within-origins-homeworlds', [...WITHIN_DOCS, { name: 'Orphan', system: {} }]);
        const map = await readHomeworldMechanics('wh40k-rpg.dh2-within-origins-homeworlds');
        expect(map.has('agri-world')).toBe(true);
        expect(map.size).toBe(2);
    });

    it('projects Agri-World to the exact values the dialog used to hardcode', async () => {
        installPack('wh40k-rpg.dh2-within-origins-homeworlds', WITHIN_DOCS);
        const map = await readHomeworldMechanics('wh40k-rpg.dh2-within-origins-homeworlds');
        const agri = map.get('agri-world');
        expect(agri).toEqual({
            id: 'agri-world',
            label: 'Agri-World',
            charModsPositive: ['fellowship', 'strength'],
            charModsNegative: ['agility'],
            fateBase: 2,
            emperorsBlessingMin: 7,
            aptitudes: ['Strength'],
            bonusName: 'Strength from the Land',
            bonusDescription: 'An agri-world character starts with the Brutal Charge (2) trait.',
            woundsFlat: 8,
            woundsDice: 1,
            woundsFaces: 5,
        } satisfies HomeworldMechanics);
    });

    it('splits characteristic mods by sign in document order', async () => {
        installPack('wh40k-rpg.dh2-within-origins-homeworlds', WITHIN_DOCS);
        const map = await readHomeworldMechanics('wh40k-rpg.dh2-within-origins-homeworlds');
        const feudal = map.get('feudal-world');
        expect(feudal?.charModsPositive).toEqual(['perception', 'weaponSkill']);
        expect(feudal?.charModsNegative).toEqual(['intelligence']);
        expect(feudal?.fateBase).toBe(3);
        expect(feudal?.emperorsBlessingMin).toBe(6);
        expect(feudal?.aptitudes).toEqual(['Weapon Skill']);
        expect(feudal?.woundsFlat).toBe(9);
    });

    it('projects a Beyond document (Daemon World) basics', async () => {
        installPack('wh40k-rpg.dh2-beyond-origins-homeworlds', [BEYOND_DAEMON]);
        const map = await readHomeworldMechanics('wh40k-rpg.dh2-beyond-origins-homeworlds');
        const daemon = map.get('daemon-world');
        expect(daemon?.charModsPositive).toEqual(['willpower', 'perception']);
        expect(daemon?.charModsNegative).toEqual(['fellowship']);
        expect(daemon?.fateBase).toBe(3);
        expect(daemon?.emperorsBlessingMin).toBe(4);
        expect(daemon?.aptitudes).toEqual(['Willpower']);
        expect(daemon?.woundsFlat).toBe(7);
    });

    it('projects a Without document (Death World) basics', async () => {
        installPack('wh40k-rpg.dh2-without-origins-homeworlds', [WITHOUT_DEATH]);
        const map = await readHomeworldMechanics('wh40k-rpg.dh2-without-origins-homeworlds');
        const death = map.get('death-world');
        expect(death?.charModsPositive).toEqual(['agility', 'perception']);
        expect(death?.charModsNegative).toEqual(['fellowship']);
        expect(death?.fateBase).toBe(2);
        expect(death?.emperorsBlessingMin).toBe(5);
        expect(death?.aptitudes).toEqual(['Fieldcraft']);
        expect(death?.woundsFlat).toBe(9);
    });

    it('falls back gracefully when wounds / blessing strings are malformed', async () => {
        installPack('wh40k-rpg.dh2-within-origins-homeworlds', [
            {
                name: 'Broken',
                system: { identifier: 'broken', grants: { woundsFormula: 'bad', aptitudes: [], specialAbilities: [] }, notes: { dh2: 'no breakpoint' } },
            },
        ]);
        const map = await readHomeworldMechanics('wh40k-rpg.dh2-within-origins-homeworlds');
        const broken = map.get('broken');
        expect(broken?.woundsFlat).toBe(0);
        expect(broken?.woundsDice).toBe(1);
        expect(broken?.woundsFaces).toBe(5);
        expect(broken?.emperorsBlessingMin).toBe(0);
        expect(broken?.bonusName).toBe('');
    });
});
