/**
 * Career Advancement Registry
 *
 * Central registry for all career advancement configurations.
 * Provides helper functions to access career-specific data.
 *
 * The per-career tables are content and live on the `rt-core-origins-careers`
 * compendium `originPath` documents (`system.careerAdvancement`), indexed at
 * `ready` into an in-memory boot cache (`./career-advancement-cache.ts`) keyed
 * by the camelCase career key. This module reads that cache; its exported API
 * is unchanged (Direction #7 — no in-`src/` content table).
 */

import { getCareerAdvancementRegistry } from './career-advancement-cache.ts';

/**
 * Registry of all career advancement configurations
 * @type {Object<string, Object>}
 */
type RankAdvance = {
    name: string;
    cost: number;
    type: string;
    specialization?: string;
    // eslint-disable-next-line no-restricted-syntax -- boundary: career data consumed via a loose registry shape
    prerequisites?: unknown[];
    // eslint-disable-next-line no-restricted-syntax -- boundary: career data consumed via a loose registry shape
    [extra: string]: unknown;
};

type CareerModule = {
    CAREER_INFO?: { name?: string };
    CHARACTERISTIC_COSTS?: Record<string, Record<string, number>>;
    RANK_1_ADVANCES?: RankAdvance[];
};

// The boot cache exposes the strict CareerTable shape; its CHARACTERISTIC_COSTS
// uses a named-tier interface that's structurally similar but not directly
// assignable to CareerModule's Record<string, number>. Cast through unknown —
// the runtime shape is identical (named-tier keys ARE strings, values ARE
// numbers) but TS's structural check rejects the named-vs-index mismatch. Read
// via a function (not a module-level const) so each call reflects the current
// cache state, which is empty until the `ready`-time index build runs.
function careerRegistry(): Record<string, CareerModule> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: cross-module structural-vs-named-key typing mismatch; runtime shape is identical.
    return getCareerAdvancementRegistry() as unknown as Record<string, CareerModule>;
}

/**
 * Tier labels for characteristic advances
 * @type {Object<string, string>}
 */
export const ADVANCEMENT_TIERS = {
    simple: 'WH40K.Advancement.Tier.Simple',
    intermediate: 'WH40K.Advancement.Tier.Intermediate',
    trained: 'WH40K.Advancement.Tier.Trained',
    expert: 'WH40K.Advancement.Tier.Expert',
};

/**
 * Tier order array
 * @type {string[]}
 */
export const TIER_ORDER = ['simple', 'intermediate', 'trained', 'expert'];

/**
 * Get all advancement data for a career
 * @param {string} careerKey - The career key (e.g., 'rogueTrader')
 * @returns {Object|null} Career advancement configuration or null if not found
 */
export function getCareerAdvancements(careerKey: string): CareerModule | null {
    const registry = careerRegistry();
    if (!Object.hasOwn(registry, careerKey)) {
        console.warn(`Career '${careerKey}' not found in advancement registry`);
        return null;
    }
    return registry[careerKey] ?? null;
}

/**
 * Get characteristic costs for a career
 * @param {string} careerKey - The career key
 * @returns {Object|null} Characteristic cost table
 */
export function getCharacteristicCosts(careerKey: string): Record<string, Record<string, number>> | null {
    const career = getCareerAdvancements(careerKey);
    return career?.CHARACTERISTIC_COSTS ?? null;
}

/**
 * Get rank advancements for a career
 * @param {string} careerKey - The career key
 * @param {number} rank - The rank number (1-based)
 * @returns {Array|null} Array of advancement options
 */
export function getRankAdvancements(careerKey: string, rank = 1): RankAdvance[] | null {
    const career = getCareerAdvancements(careerKey);
    if (career === null) return null;

    // Currently only Rank 1 is defined
    if (rank === 1) {
        return career.RANK_1_ADVANCES ?? null;
    }

    // Future: career.RANK_2_ADVANCES, etc.
    return null;
}

/**
 * Get the cost for the next characteristic advance
 * @param {string} careerKey - The career key
 * @param {string} characteristicKey - The characteristic key (e.g., 'fellowship')
 * @param {number} currentAdvances - Number of advances already purchased (0-4)
 * @returns {{cost: number, tier: string}|null} Cost and tier name, or null if maxed
 */
export function getNextCharacteristicCost(careerKey: string, characteristicKey: string, currentAdvances: number): { cost: number; tier: string } | null {
    const costs = getCharacteristicCosts(careerKey);
    const charCosts = costs?.[characteristicKey];
    if (charCosts === undefined) return null;

    if (currentAdvances >= TIER_ORDER.length) return null; // Already maxed

    const tier = TIER_ORDER[currentAdvances] as string | undefined;
    if (tier === undefined) return null;
    const cost = charCosts[tier] as number | undefined;
    if (cost === undefined) return null;

    return { cost, tier };
}

/**
 * Get all available careers
 * @returns {Array<{key: string, name: string}>} List of career keys and names
 */
export function getAvailableCareers(): { key: string; name: string }[] {
    return Object.entries(careerRegistry()).map(([key, career]) => ({
        key,
        name: career.CAREER_INFO?.name ?? key,
    }));
}

/**
 * Map a career name (from origin path) to its registry key
 * @param {string} careerName - The career name (e.g., "Arch-Militant", "Rogue Trader")
 * @returns {string|null} The career key or null if not found
 */
export function getCareerKeyFromName(careerName: string): string | null {
    if (careerName === '') return null;

    const normalized = careerName.toLowerCase().trim();

    // Direct mapping of common name variations to keys
    const nameToKey: Record<string, string> = {
        'wh40k rpg': 'rogueTrader',
        'roguetrader': 'rogueTrader',
        'arch-militant': 'archMilitant',
        'archmilitant': 'archMilitant',
        'arch militant': 'archMilitant',
        'astropath': 'astropath',
        'astropath transcendant': 'astropath',
        'explorator': 'explorator',
        'missionary': 'missionary',
        'navigator': 'navigator',
        'seneschal': 'seneschal',
        'void-master': 'voidMaster',
        'voidmaster': 'voidMaster',
        'void master': 'voidMaster',
    };

    const mapped = nameToKey[normalized] as string | undefined;
    if (mapped !== undefined) {
        return mapped;
    }

    // Fallback: check if it matches a key directly
    if (Object.hasOwn(careerRegistry(), careerName)) {
        return careerName;
    }

    return null;
}

/**
 * Check if a career exists in the registry
 * @param {string} careerKey - The career key to check
 * @returns {boolean}
 */
export function hasCareer(careerKey: string): boolean {
    return careerKey in careerRegistry();
}
