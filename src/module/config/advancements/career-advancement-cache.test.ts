import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PackMetadataLike } from '../../utils/line-packs.ts';
import { CAREER_INDEX_FIELDS, packIndexFields } from '../../utils/pack-index.ts';
import {
    buildCareerAdvancementIndex,
    CAREER_PACK_CATEGORIES,
    careerAdvancementIndexReady,
    getCareerAdvancementRegistry,
    isCareerAdvancementIndexReady,
    resetCareerAdvancementIndexForTesting,
    setCareerAdvancementsForTesting,
    type CareerTable,
} from './career-advancement-cache.ts';

/**
 * Drives the compendium-backed career-advancement boot cache with a synthetic
 * RT career-origins pack stub, exercising the kebab-identifier →
 * camelCase-key mapping, cost/advance normalization, and skip rules. The
 * `src/packs` submodule is not checked out in worktrees, so the docs are inline
 * rather than read from `_source`.
 */

interface StubAdvance {
    name: string;
    cost: number;
    type: string;
    specialization?: string;
    multiplier?: number;
    level?: number;
    prerequisites: Array<{ type: string; key: string; value?: number }>;
}

interface StubDoc {
    name?: string;
    system?: {
        identifier?: string;
        careerAdvancement?: {
            characteristicCosts?: Record<string, { simple: number; intermediate: number; trained: number; expert: number }>;
            rank1Advances?: StubAdvance[];
            ranks?: Array<{ rank: number; title?: string; minXp?: number | null; advances?: StubAdvance[] }>;
        } | null;
    };
}

/** A career-origins pack of `line`, by its manifest flags, whose index rows are `docs` (#706). */
function packWith(
    docs: StubDoc[],
    line = 'rt',
    category = 'origins-careers',
): { metadata: PackMetadataLike; getIndex: ReturnType<typeof vi.fn<(options: { fields: string[] }) => Promise<StubDoc[]>>> } {
    return {
        metadata: { name: `${line}-${category}`, flags: { 'wh40k-rpg': { line, category, homebrew: false } } },
        getIndex: vi.fn<(options: { fields: string[] }) => Promise<StubDoc[]>>(async () => {
            await Promise.resolve();
            return docs;
        }),
    };
}

function stubPack(docs: StubDoc[] | null): void {
    vi.stubGlobal('game', { packs: docs === null ? [] : [packWith(docs), packWith([], 'dh1')] });
}

/** Fetch a built career, asserting presence — narrows the record access once so callers avoid per-site guards. */
function careerOf(key: string, line = 'rt'): CareerTable {
    const table = getCareerAdvancementRegistry(line)[key];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess (tsconfig with the flag on) types this record access as CareerTable|undefined; the ESLint parser config has the flag off and sees the guard as redundant
    if (table === undefined) throw new Error(`career '${key}' not in registry`);
    return table;
}

const ROGUE_TRADER_DOC: StubDoc = {
    name: 'Rogue Trader',
    system: {
        identifier: 'rogue-trader',
        careerAdvancement: {
            characteristicCosts: {
                fellowship: { simple: 100, intermediate: 250, trained: 500, expert: 750 },
                strength: { simple: 500, intermediate: 750, trained: 1000, expert: 2500 },
            },
            rank1Advances: [
                { name: 'Awareness', cost: 100, type: 'skill', prerequisites: [] },
                { name: 'Ciphers', cost: 100, type: 'skill', specialization: 'Rogue Trader', prerequisites: [] },
                { name: 'Air of Authority', cost: 100, type: 'talent', prerequisites: [{ type: 'characteristic', key: 'fellowship', value: 30 }] },
            ],
        },
    },
};

const ARCH_MILITANT_DOC: StubDoc = {
    name: 'Arch-Militant',
    system: {
        identifier: 'arch-militant',
        careerAdvancement: {
            characteristicCosts: { weaponSkill: { simple: 250, intermediate: 500, trained: 750, expert: 1000 } },
            rank1Advances: [{ name: 'Sound Constitution', cost: 200, type: 'talent', multiplier: 2, prerequisites: [] }],
        },
    },
};

afterEach(() => {
    resetCareerAdvancementIndexForTesting();
    vi.unstubAllGlobals();
});

describe('buildCareerAdvancementIndex', () => {
    it('reads the career packs as one index request with the career fields, not whole documents (#706)', async () => {
        const pack = packWith([]);
        vi.stubGlobal('game', { packs: [pack] });
        await buildCareerAdvancementIndex();
        expect(pack.getIndex).toHaveBeenCalledTimes(1);
        expect(pack.getIndex).toHaveBeenCalledWith({ fields: ['name', 'type', ...CAREER_INDEX_FIELDS] });
    });

    it('maps kebab identifiers to camelCase registry keys', async () => {
        stubPack([ROGUE_TRADER_DOC, ARCH_MILITANT_DOC]);
        await buildCareerAdvancementIndex();
        const registry = getCareerAdvancementRegistry();
        expect(Object.keys(registry).sort()).toEqual(['archMilitant', 'rogueTrader']);
    });

    it('normalizes characteristic costs into the strict tier table', async () => {
        stubPack([ROGUE_TRADER_DOC]);
        await buildCareerAdvancementIndex();
        const rt = careerOf('rogueTrader');
        expect(rt.CHARACTERISTIC_COSTS['fellowship']).toEqual({ simple: 100, intermediate: 250, trained: 500, expert: 750 });
        expect(rt.TIER_ORDER).toEqual(['simple', 'intermediate', 'trained', 'expert']);
    });

    it('preserves advance specialization, multiplier, and prerequisites', async () => {
        stubPack([ROGUE_TRADER_DOC, ARCH_MILITANT_DOC]);
        await buildCareerAdvancementIndex();
        const cipher = careerOf('rogueTrader').RANK_1_ADVANCES.find((a) => a.name === 'Ciphers');
        expect(cipher?.specialization).toBe('Rogue Trader');
        const authority = careerOf('rogueTrader').RANK_1_ADVANCES.find((a) => a.name === 'Air of Authority');
        expect(authority?.prerequisites).toEqual([{ type: 'characteristic', key: 'fellowship', value: 30 }]);
        const soundCon = careerOf('archMilitant').RANK_1_ADVANCES.find((a) => a.name === 'Sound Constitution');
        expect(soundCon?.multiplier).toBe(2);
    });

    it('uses the compendium doc name for CAREER_INFO.name', async () => {
        stubPack([ARCH_MILITANT_DOC]);
        await buildCareerAdvancementIndex();
        expect(careerOf('archMilitant').CAREER_INFO.name).toBe('Arch-Militant');
    });

    it('skips unknown identifiers and docs without careerAdvancement', async () => {
        stubPack([
            { name: 'Mystery', system: { identifier: 'not-a-career', careerAdvancement: { rank1Advances: [] } } },
            { name: 'Empty', system: { identifier: 'seneschal', careerAdvancement: null } },
            ARCH_MILITANT_DOC,
        ]);
        await buildCareerAdvancementIndex();
        expect(Object.keys(getCareerAdvancementRegistry())).toEqual(['archMilitant']);
    });

    it('carries a skill advance\'s rank level, so a printed "+10" is the bare skill at level 2', async () => {
        const guardsman: StubDoc = {
            name: 'Guardsman',
            system: {
                identifier: 'guardsman',
                careerAdvancement: { ranks: [{ rank: 2, advances: [{ name: 'Carouse', cost: 100, type: 'skill', level: 2, prerequisites: [] }] }] },
            },
        };
        vi.stubGlobal('game', { packs: [packWith([guardsman], 'dh1')] });
        await buildCareerAdvancementIndex();
        const carouse = careerOf('guardsman', 'dh1').RANKS[0]?.advances[0];
        expect(carouse).toMatchObject({ name: 'Carouse', level: 2 });
    });

    it("reads Deathwatch's specialities and Chapters, its career packs", async () => {
        const tactical: StubDoc = {
            name: 'Tactical Marine',
            system: {
                identifier: 'tactical-marine',
                careerAdvancement: { ranks: [{ rank: 1, advances: [{ name: 'Awareness', cost: 200, type: 'skill', prerequisites: [] }] }] },
            },
        };
        const ultramarines: StubDoc = {
            name: 'Ultramarines',
            system: {
                identifier: 'ultramarines',
                careerAdvancement: { ranks: [{ rank: 1, advances: [{ name: 'Command', cost: 200, type: 'skill', prerequisites: [] }] }] },
            },
        };
        vi.stubGlobal('game', { packs: [packWith([tactical], 'dw', 'origins-specialities'), packWith([ultramarines], 'dw', 'origins-chapters')] });
        await buildCareerAdvancementIndex();
        expect(careerOf('tactical-marine', 'dw').RANK_1_ADVANCES.map((a) => a.name)).toEqual(['Awareness']);
        // The Chapters' advances load into the same registry, by their own identifiers.
        expect(careerOf('ultramarines', 'dw').RANK_1_ADVANCES.map((a) => a.name)).toEqual(['Command']);
    });

    it('yields an empty registry when the pack is absent', async () => {
        stubPack(null);
        await buildCareerAdvancementIndex();
        expect(getCareerAdvancementRegistry()).toEqual({});
        expect(isCareerAdvancementIndexReady()).toBe(true);
    });
});

describe('registry state helpers', () => {
    it('reports not-ready until built or seeded', () => {
        expect(isCareerAdvancementIndexReady()).toBe(false);
        expect(getCareerAdvancementRegistry()).toEqual({});
    });

    it('setCareerAdvancementsForTesting seeds the registry synchronously', () => {
        const table: CareerTable = {
            CAREER_INFO: { key: 'navigator', name: 'Navigator', description: '', ranks: ['Rank 1'] },
            CHARACTERISTIC_COSTS: { agility: { simple: 500, intermediate: 750, trained: 1000, expert: 2500 } },
            RANK_1_ADVANCES: [{ name: 'Navigation', cost: 100, type: 'skill', prerequisites: [] }],
            RANKS: [],
            TIER_ORDER: ['simple', 'intermediate', 'trained', 'expert'],
        };
        setCareerAdvancementsForTesting({ navigator: table });
        expect(isCareerAdvancementIndexReady()).toBe(true);
        expect(getCareerAdvancementRegistry()['navigator']).toBe(table);
    });
});

/** A DH1 career with a rank-1 list and rank tables, as the parser authors them (operator ruling 2026-11-14). */
const ADEPT_DOC: StubDoc = {
    name: 'Adept',
    system: {
        identifier: 'adept',
        careerAdvancement: {
            characteristicCosts: {},
            rank1Advances: [{ name: 'Literacy', cost: 100, type: 'skill', prerequisites: [] }],
            ranks: [
                { rank: 2, title: 'Archivist', minXp: 500, advances: [{ name: 'Inquiry', cost: 200, type: 'skill', prerequisites: [] }] },
                { rank: 1, title: 'Initiate', minXp: 0, advances: [{ name: 'Scrutiny', cost: 100, type: 'skill', prerequisites: [] }] },
                { rank: 0, advances: [{ name: 'Ignored', cost: 1, type: 'skill', prerequisites: [] }] },
            ],
        },
    },
};

describe('every career line, every rank (operator ruling 2026-11-14)', () => {
    it("indexes a non-RT line's careers by identifier, in its own registry", async () => {
        vi.stubGlobal('game', { packs: [packWith([ROGUE_TRADER_DOC]), packWith([ADEPT_DOC], 'dh1')] });
        await buildCareerAdvancementIndex();
        expect(Object.keys(getCareerAdvancementRegistry('dh1'))).toEqual(['adept']);
        expect(Object.keys(getCareerAdvancementRegistry())).toEqual(['rogueTrader']);
    });

    it('orders the ranks, merges rank 1 with rank1Advances, and drops a rank below 1', async () => {
        vi.stubGlobal('game', { packs: [packWith([ADEPT_DOC], 'dh1')] });
        await buildCareerAdvancementIndex();
        const adept = careerOf('adept', 'dh1');
        expect(adept.RANKS.map((rank) => [rank.rank, rank.title, rank.minXp, rank.advances.map((a) => a.name)])).toEqual([
            [1, 'Initiate', 0, ['Literacy', 'Scrutiny']],
            [2, 'Archivist', 500, ['Inquiry']],
        ]);
        expect(adept.RANK_1_ADVANCES.map((a) => a.name)).toEqual(['Literacy', 'Scrutiny']);
        expect(adept.CAREER_INFO.ranks).toEqual(['Initiate', 'Archivist']);
    });
});

describe('the career packs are indexed with their tables', () => {
    it('asks every category the cache reads for the career fields (a DW speciality pack once came back without them)', () => {
        for (const [line, categories] of Object.entries(CAREER_PACK_CATEGORIES)) {
            for (const category of categories) {
                const fields = packIndexFields({ name: `${line}-${category}`, flags: { 'wh40k-rpg': { line, category, homebrew: false } } });
                expect(fields, `${line} ${category}`).toEqual(expect.arrayContaining([...CAREER_INDEX_FIELDS]));
            }
        }
    });
});

describe('careerAdvancementIndexReady', () => {
    it('waits for the index build, then resolves', async () => {
        let settled = false;
        const ready = careerAdvancementIndexReady().then(() => {
            settled = true;
        });
        await Promise.resolve();
        expect(settled).toBe(false);
        stubPack([ROGUE_TRADER_DOC]);
        await buildCareerAdvancementIndex();
        await ready;
        expect(settled).toBe(true);
    });
});
