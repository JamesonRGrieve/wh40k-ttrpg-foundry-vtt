import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    buildCareerAdvancementIndex,
    getCareerAdvancementRegistry,
    isCareerAdvancementIndexReady,
    resetCareerAdvancementIndexForTesting,
    setCareerAdvancementsForTesting,
    type CareerTable,
} from './career-advancement-cache.ts';

/**
 * Drives the compendium-backed career-advancement boot cache with a synthetic
 * `rt-core-origins-careers` pack stub, exercising the kebab-identifier →
 * camelCase-key mapping, cost/advance normalization, and skip rules. The
 * `src/packs` submodule is not checked out in worktrees, so the docs are inline
 * rather than read from `_source`.
 */

interface StubDoc {
    name?: string;
    system?: {
        identifier?: string;
        careerAdvancement?: {
            characteristicCosts?: Record<string, { simple: number; intermediate: number; trained: number; expert: number }>;
            rank1Advances?: Array<{
                name: string;
                cost: number;
                type: string;
                specialization?: string;
                multiplier?: number;
                prerequisites: Array<{ type: string; key: string; value?: number }>;
            }>;
        } | null;
    };
}

function packWith(docs: StubDoc[]): { getDocuments: () => Promise<StubDoc[]> } {
    return {
        getDocuments: async () => {
            await Promise.resolve();
            return docs;
        },
    };
}

function stubPack(docs: StubDoc[] | null): void {
    vi.stubGlobal('game', {
        packs: {
            get: (id: string) => (id === 'wh40k-rpg.rt-core-origins-careers' && docs !== null ? packWith(docs) : undefined),
        },
    });
}

/** Fetch a built career, asserting presence — narrows the record access once so callers avoid per-site guards. */
function careerOf(key: string): CareerTable {
    const table = getCareerAdvancementRegistry()[key];
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
            TIER_ORDER: ['simple', 'intermediate', 'trained', 'expert'],
        };
        setCareerAdvancementsForTesting({ navigator: table });
        expect(isCareerAdvancementIndexReady()).toBe(true);
        expect(getCareerAdvancementRegistry()['navigator']).toBe(table);
    });
});
