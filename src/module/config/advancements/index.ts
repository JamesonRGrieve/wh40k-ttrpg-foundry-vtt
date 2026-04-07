/**
 * Career Advancement Registry
 *
 * Central registry for all career advancement configurations.
 * Provides helper functions to access career-specific data.
 */

import * as WH40K from './wh40k-rpg.ts';
import * as ArchMilitant from './arch-militant.ts';
import * as Astropath from './astropath.ts';
import * as Explorator from './explorator.ts';
import * as Missionary from './missionary.ts';
import * as Navigator from './navigator.ts';
import * as Seneschal from './seneschal.ts';
import * as VoidMaster from './void-master.ts';

/**
 * Registry of all career advancement configurations
 * @type {Object<string, Object>}
 */
const CAREER_REGISTRY = {
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
export function getCareerAdvancements(careerKey) {
    const career = CAREER_REGISTRY[careerKey];
    if (!career) {
        console.warn(`Career '${careerKey}' not found in advancement registry`);
        return null;
    }
    return career;
}

/**
 * Get characteristic costs for a career
 * @param {string} careerKey - The career key
 * @returns {Object|null} Characteristic cost table
 */
export function getCharacteristicCosts(careerKey) {
    const career = getCareerAdvancements(careerKey);
    return career?.CHARACTERISTIC_COSTS ?? null;
}

/**
 * Get rank advancements for a career
 * @param {string} careerKey - The career key
 * @param {number} rank - The rank number (1-based)
 * @returns {Array|null} Array of advancement options
 */
export function getRankAdvancements(careerKey, rank = 1) {
    const career = getCareerAdvancements(careerKey);
    if (!career) return null;

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
export function getNextCharacteristicCost(careerKey, characteristicKey, currentAdvances) {
    const costs = getCharacteristicCosts(careerKey);
    if (!costs || !costs[characteristicKey]) return null;

    if (currentAdvances >= TIER_ORDER.length) return null; // Already maxed

    const tier = TIER_ORDER[currentAdvances];
    const cost = costs[characteristicKey][tier];

    return { cost, tier };
}

/**
 * Get all available careers
 * @returns {Array<{key: string, name: string}>} List of career keys and names
 */
export function getAvailableCareers() {
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
export function getCareerKeyFromName(careerName) {
    if (!careerName) return null;

    const normalized = careerName.toLowerCase().trim();

    // Direct mapping of common name variations to keys
    const nameToKey = {
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

    if (nameToKey[normalized]) {
        return nameToKey[normalized];
    }

    // Fallback: check if it matches a key directly
    if (CAREER_REGISTRY[careerName]) {
        return careerName;
    }

    return null;
}

/**
 * Check if a career exists in the registry
 * @param {string} careerKey - The career key to check
 * @returns {boolean}
 */
export function hasCareer(careerKey) {
    return careerKey in CAREER_REGISTRY;
}
