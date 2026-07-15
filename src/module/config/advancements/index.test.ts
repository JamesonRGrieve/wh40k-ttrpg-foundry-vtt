import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetCareerAdvancementIndexForTesting, setCareerAdvancementsForTesting, type CareerTable } from './career-advancement-cache.ts';
import {
    getAvailableCareers,
    getCareerAdvancements,
    getCareerKeyFromName,
    getCharacteristicCosts,
    getNextCharacteristicCost,
    getRankAdvancements,
    hasCareer,
} from './index.ts';

/**
 * The advancement getters read the compendium-backed boot cache. Seeding the
 * cache with `setCareerAdvancementsForTesting` exercises the getters' shape and
 * behavior without a live Foundry pack.
 */

const ROGUE_TRADER: CareerTable = {
    CAREER_INFO: { key: 'rogueTrader', name: 'Rogue Trader', description: '', ranks: ['Rank 1', 'Rank 2'] },
    CHARACTERISTIC_COSTS: {
        fellowship: { simple: 100, intermediate: 250, trained: 500, expert: 750 },
        strength: { simple: 500, intermediate: 750, trained: 1000, expert: 2500 },
    },
    RANK_1_ADVANCES: [
        { name: 'Awareness', cost: 100, type: 'skill', prerequisites: [] },
        { name: 'Air of Authority', cost: 100, type: 'talent', prerequisites: [{ type: 'characteristic', key: 'fellowship', value: 30 }] },
    ],
    TIER_ORDER: ['simple', 'intermediate', 'trained', 'expert'],
};

const ARCH_MILITANT: CareerTable = {
    CAREER_INFO: { key: 'archMilitant', name: 'Arch-Militant', description: '', ranks: ['Rank 1'] },
    CHARACTERISTIC_COSTS: { weaponSkill: { simple: 250, intermediate: 500, trained: 750, expert: 1000 } },
    RANK_1_ADVANCES: [{ name: 'Sound Constitution', cost: 200, type: 'talent', prerequisites: [] }],
    TIER_ORDER: ['simple', 'intermediate', 'trained', 'expert'],
};

beforeEach(() => {
    setCareerAdvancementsForTesting({ rogueTrader: ROGUE_TRADER, archMilitant: ARCH_MILITANT });
});

afterEach(() => {
    resetCareerAdvancementIndexForTesting();
});

describe('getCareerAdvancements', () => {
    it('returns the seeded career table', () => {
        expect(getCareerAdvancements('rogueTrader')?.RANK_1_ADVANCES?.length).toBe(2);
    });

    it('returns null for an unknown career', () => {
        expect(getCareerAdvancements('missionary')).toBeNull();
    });
});

describe('getCharacteristicCosts / getNextCharacteristicCost', () => {
    it('returns the characteristic cost table', () => {
        expect(getCharacteristicCosts('rogueTrader')?.['fellowship']).toEqual({ simple: 100, intermediate: 250, trained: 500, expert: 750 });
    });

    it('walks the tier order by number of advances already purchased', () => {
        expect(getNextCharacteristicCost('rogueTrader', 'fellowship', 0)).toEqual({ cost: 100, tier: 'simple' });
        expect(getNextCharacteristicCost('rogueTrader', 'fellowship', 2)).toEqual({ cost: 500, tier: 'trained' });
        expect(getNextCharacteristicCost('rogueTrader', 'fellowship', 3)).toEqual({ cost: 750, tier: 'expert' });
    });

    it('returns null once all four tiers are purchased', () => {
        expect(getNextCharacteristicCost('rogueTrader', 'fellowship', 4)).toBeNull();
    });

    it('returns null for a characteristic the career does not list', () => {
        expect(getNextCharacteristicCost('rogueTrader', 'weaponSkill', 0)).toBeNull();
    });
});

describe('getRankAdvancements', () => {
    it('returns rank 1 advances', () => {
        expect(getRankAdvancements('archMilitant', 1)?.[0]?.name).toBe('Sound Constitution');
    });

    it('returns null for ranks beyond 1', () => {
        expect(getRankAdvancements('archMilitant', 2)).toBeNull();
    });
});

describe('getAvailableCareers', () => {
    it('lists every seeded career with its display name', () => {
        expect(getAvailableCareers()).toEqual([
            { key: 'rogueTrader', name: 'Rogue Trader' },
            { key: 'archMilitant', name: 'Arch-Militant' },
        ]);
    });
});

describe('getCareerKeyFromName', () => {
    it('maps common name variants to camelCase keys', () => {
        expect(getCareerKeyFromName('Arch-Militant')).toBe('archMilitant');
        expect(getCareerKeyFromName('void master')).toBe('voidMaster');
    });

    it('falls back to a direct registry key match', () => {
        expect(getCareerKeyFromName('rogueTrader')).toBe('rogueTrader');
    });

    it('returns null for an empty or unknown name', () => {
        expect(getCareerKeyFromName('')).toBeNull();
        expect(getCareerKeyFromName('Not A Career')).toBeNull();
    });
});

describe('hasCareer', () => {
    it('reflects the seeded registry', () => {
        expect(hasCareer('rogueTrader')).toBe(true);
        expect(hasCareer('missionary')).toBe(false);
    });
});
