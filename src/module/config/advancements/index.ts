/**
 * Career Advancement Registry
 *
 * Central registry for all career advancement configurations.
 * Provides helper functions to access career-specific data.
 */

import * as ArchMilitant from './arch-militant.ts';
import * as Astropath from './astropath.ts';
import * as Explorator from './explorator.ts';
import * as Missionary from './missionary.ts';
import * as Navigator from './navigator.ts';
import * as Seneschal from './seneschal.ts';
import * as VoidMaster from './void-master.ts';
import * as WH40K from './wh40k-rpg.ts';

/**
 * Registry of all career advancement configurations
 * @type {Object<string, Object>}
 */
type RankAdvance = {
    name: string;
    cost: number;
    type: string;
    specialization?: string;
    // eslint-disable-next-line no-restricted-syntax -- boundary: career data from untyped external modules
    prerequisites?: unknown[];
    // eslint-disable-next-line no-restricted-syntax -- boundary: career data from untyped external modules
    [extra: string]: unknown;
};

type CareerModule = {
    CAREER_INFO?: { name?: string };
    CHARACTERISTIC_COSTS?: Record<string, Record<string, number>>;
    RANK_1_ADVANCES?: RankAdvance[];
};

const CAREER_REGISTRY: Record<string, CareerModule> = {
    rogueTrader: WH40K,
    archMilitant: ArchMilitant,
    astropath: Astropath,
    explorator: Explorator,
    missionary: Missionary,
    navigator: Navigator,
    seneschal: Seneschal,
    voidMaster: VoidMaster,
};

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
    if (!Object.prototype.hasOwnProperty.call(CAREER_REGISTRY, careerKey)) {
        console.warn(`Career '${careerKey}' not found in advancement registry`);
        return null;
    }
    return CAREER_REGISTRY[careerKey] ?? null;
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
    return Object.entries(CAREER_REGISTRY).map(([key, career]) => ({
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
    if (Object.prototype.hasOwnProperty.call(CAREER_REGISTRY, careerName)) {
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
    return careerKey in CAREER_REGISTRY;
}
