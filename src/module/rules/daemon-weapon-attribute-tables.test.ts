import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    DAEMON_WEAPON_ATTRIBUTE_PACK,
    DAEMON_WEAPON_ATTRIBUTE_TABLE_KEYS,
    type DaemonWeaponAttribute,
    type DaemonWeaponAttributeTable,
    type DaemonWeaponAttributeTables,
    attributeAtRoll,
    readDaemonWeaponAttributeTables,
    rollDaemonWeaponAttributes,
    tableForAlignment,
} from './daemon-weapon-attribute-tables.ts';
import { BINDING_STRENGTH_PROFILES, type BindingStrength } from './daemon-weapon.ts';

/**
 * Coverage for the compendium-sourced Daemon Weapon Attribute tables + roller
 * (#142). The table content now lives in the packs submodule as RollTable
 * documents; this suite pins:
 *  - the pack reader's projection (RollTable → keyed DaemonWeaponAttribute list)
 *    and its graceful degradation when the pack is missing/broken;
 *  - the content-agnostic roll mechanics (slot count per Binding Strength,
 *    "slot 1 = General, later slots = aligned" routing, deterministic RNG).
 *
 * `game.packs` is a framework global, stubbed per-test.
 */

/* -------------------------------------------- */
/*  Pack stub                                    */
/* -------------------------------------------- */

interface RawResult {
    range?: readonly number[] | null;
    flags?: { 'wh40k-rpg'?: { attribute?: { id?: string; label?: string; effect?: string } } };
}
interface RawTable {
    results?: RawResult[];
    flags?: { 'wh40k-rpg'?: { daemonWeaponAttributeTable?: string } };
}
interface FakePack {
    getDocuments?: () => Promise<RawTable[]>;
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

const FIXTURE_RANGES: readonly (readonly [number, number])[] = [
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
    [9, 9],
    [10, 10],
];

/** Build a RollTable doc for one table key, mirroring the packs `_source` shape. */
function fakeTableDoc(key: DaemonWeaponAttributeTable): RawTable {
    return {
        flags: { 'wh40k-rpg': { daemonWeaponAttributeTable: key } },
        results: FIXTURE_RANGES.map((range, index) => ({
            range,
            flags: {
                'wh40k-rpg': {
                    attribute: { id: `${key}.a${index + 1}`, label: `${key} ${index + 1}`, effect: `effect ${index + 1}` },
                },
            },
        })),
    };
}

function installPack(packId: string, docs: RawTable[]): void {
    const getDocuments = vi.fn<() => Promise<RawTable[]>>().mockResolvedValue(docs);
    G.game = { packs: { get: (id) => (id === packId ? { getDocuments } : undefined) } };
}

/** All five tables, populated from the fixture — a pure in-memory stand-in for the loaded pack. */
function fixtureTables(): DaemonWeaponAttributeTables {
    const map = new Map<DaemonWeaponAttributeTable, readonly DaemonWeaponAttribute[]>();
    for (const key of DAEMON_WEAPON_ATTRIBUTE_TABLE_KEYS) {
        map.set(
            key,
            FIXTURE_RANGES.map((range, index) => ({
                id: `${key}.a${index + 1}`,
                roll: range,
                label: `${key} ${index + 1}`,
                effect: `effect ${index + 1}`,
            })),
        );
    }
    return map;
}

/* -------------------------------------------- */
/*  tableForAlignment routing                    */
/* -------------------------------------------- */

describe('tableForAlignment routing', () => {
    it('routes each Chaos god to its own table', () => {
        expect(tableForAlignment('khorne')).toBe('khorne');
        expect(tableForAlignment('nurgle')).toBe('nurgle');
        expect(tableForAlignment('slaanesh')).toBe('slaanesh');
        expect(tableForAlignment('tzeentch')).toBe('tzeentch');
    });

    it('routes unaligned weapons back to the General table', () => {
        expect(tableForAlignment('unaligned')).toBe('general');
    });
});

/* -------------------------------------------- */
/*  readDaemonWeaponAttributeTables (reader)     */
/* -------------------------------------------- */

describe('readDaemonWeaponAttributeTables (#142)', () => {
    it('projects each RollTable into an ordered, keyed DaemonWeaponAttribute list', async () => {
        const docs = DAEMON_WEAPON_ATTRIBUTE_TABLE_KEYS.map(fakeTableDoc);
        installPack(DAEMON_WEAPON_ATTRIBUTE_PACK, docs);

        const tables = await readDaemonWeaponAttributeTables();
        expect([...tables.keys()].sort()).toEqual([...DAEMON_WEAPON_ATTRIBUTE_TABLE_KEYS].sort());

        const khorne = tables.get('khorne');
        expect(khorne).toHaveLength(6);
        // Sorted ascending by range start, covering 1..10.
        expect(khorne?.map((e) => e.roll)).toEqual(FIXTURE_RANGES);
        expect(khorne?.[0]).toMatchObject({ id: 'khorne.a1', label: 'khorne 1', effect: 'effect 1' });
    });

    it('sorts results by range start even when the source order is shuffled', async () => {
        const shuffled: RawTable = {
            flags: { 'wh40k-rpg': { daemonWeaponAttributeTable: 'general' } },
            results: [
                { range: [10, 10], flags: { 'wh40k-rpg': { attribute: { id: 'g.hi', label: 'Hi', effect: 'x' } } } },
                { range: [1, 2], flags: { 'wh40k-rpg': { attribute: { id: 'g.lo', label: 'Lo', effect: 'y' } } } },
            ],
        };
        installPack(DAEMON_WEAPON_ATTRIBUTE_PACK, [shuffled]);
        const tables = await readDaemonWeaponAttributeTables();
        expect(tables.get('general')?.map((e) => e.id)).toEqual(['g.lo', 'g.hi']);
    });

    it('ignores RollTables without the daemonWeaponAttributeTable flag', async () => {
        const unrelated: RawTable = { flags: { 'wh40k-rpg': {} }, results: [{ range: [1, 10] }] };
        installPack(DAEMON_WEAPON_ATTRIBUTE_PACK, [unrelated, fakeTableDoc('general')]);
        const tables = await readDaemonWeaponAttributeTables();
        expect([...tables.keys()]).toEqual(['general']);
    });

    it('returns an empty Map when the pack is absent', async () => {
        G.game = { packs: { get: () => undefined } };
        expect((await readDaemonWeaponAttributeTables()).size).toBe(0);
    });

    it('returns an empty Map (no uncaught error) when getDocuments throws', async () => {
        const failing: FakePack = {
            getDocuments: vi.fn<() => Promise<RawTable[]>>().mockRejectedValue(new Error("Cannot read properties of undefined (reading 'database')")),
        };
        vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        G.game = { packs: { get: () => failing } };
        expect((await readDaemonWeaponAttributeTables()).size).toBe(0);
        vi.restoreAllMocks();
    });
});

/* -------------------------------------------- */
/*  attributeAtRoll                              */
/* -------------------------------------------- */

describe('attributeAtRoll', () => {
    const tables = fixtureTables();

    it('resolves every d10 face 1..10 to the covering entry', () => {
        for (let face = 1; face <= 10; face += 1) {
            const entry = attributeAtRoll(tables, 'khorne', face);
            if (entry === undefined) throw new Error(`face ${face} did not resolve`);
            expect(face).toBeGreaterThanOrEqual(entry.roll[0]);
            expect(face).toBeLessThanOrEqual(entry.roll[1]);
        }
    });

    it('clamps out-of-band values to the table range', () => {
        expect(attributeAtRoll(tables, 'khorne', 0)?.roll[0]).toBe(1);
        expect(attributeAtRoll(tables, 'khorne', 99)?.roll[1]).toBe(10);
    });

    it('returns undefined for an absent/empty table', () => {
        expect(attributeAtRoll(new Map(), 'khorne', 5)).toBeUndefined();
    });
});

/* -------------------------------------------- */
/*  rollDaemonWeaponAttributes (roller)          */
/* -------------------------------------------- */

describe('rollDaemonWeaponAttributes (#142)', () => {
    const tables = fixtureTables();
    const STRENGTHS: readonly BindingStrength[] = ['minor', 'lesser', 'normal', 'greater', 'major'];

    for (const strength of STRENGTHS) {
        it(`rolls exactly ${BINDING_STRENGTH_PROFILES[strength].attributes} slot(s) for binding=${strength}`, () => {
            const result = rollDaemonWeaponAttributes('khorne', strength, tables, () => 0);
            expect(result.slots).toBe(BINDING_STRENGTH_PROFILES[strength].attributes);
            expect(result.picks).toHaveLength(BINDING_STRENGTH_PROFILES[strength].attributes);
        });
    }

    it('slot 1 always uses the General table even when alignment is set', () => {
        const result = rollDaemonWeaponAttributes('tzeentch', 'major', tables, () => 0.5);
        expect(result.picks[0]?.table).toBe('general');
        for (const pick of result.picks.slice(1)) {
            expect(pick.table).toBe('tzeentch');
        }
    });

    it('unaligned weapons roll every slot on the General table', () => {
        const result = rollDaemonWeaponAttributes('unaligned', 'major', tables, () => 0.9);
        for (const pick of result.picks) {
            expect(pick.table).toBe('general');
        }
    });

    it('honours the injected RNG and resolves the attribute content (deterministic snapshot)', () => {
        // Sequence forces rolls: floor(0.05*10)+1=1, floor(0.15*10)+1=2, floor(0.95*10)+1=10
        const seq = [0.05, 0.15, 0.95];
        let idx = 0;
        const rng = (): number => seq[idx++ % seq.length] ?? 0;
        const result = rollDaemonWeaponAttributes('khorne', 'normal', tables, rng);
        expect(result.picks.map((p) => p.roll)).toEqual([1, 2, 10]);
        expect(result.picks[0]?.table).toBe('general');
        expect(result.picks[1]?.table).toBe('khorne');
        expect(result.picks[2]?.table).toBe('khorne');
        // Content is pulled from the (fixture) tables, not hardcoded.
        expect(result.picks[0]?.attribute).toMatchObject({ id: 'general.a1', label: 'general 1' });
        expect(result.picks[2]?.attribute).toMatchObject({ id: 'khorne.a6', label: 'khorne 6' });
    });

    it('still returns one pick per slot with empty content when the tables are absent', () => {
        const result = rollDaemonWeaponAttributes('khorne', 'normal', new Map(), () => 0);
        expect(result.picks).toHaveLength(3);
        for (const pick of result.picks) {
            expect(pick.attribute.label).toBe('');
            expect(pick.attribute.effect).toBe('');
        }
    });
});
