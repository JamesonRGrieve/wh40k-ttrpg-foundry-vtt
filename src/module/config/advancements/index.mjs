/**
 * Career Advancement Registry
 * 
 * Central registry for all career advancement configurations.
 * Provides helper functions to access career-specific data.
 */

import * as RogueTrader from './rogue-trader.mjs';
import * as ArchMilitant from './arch-militant.mjs';
import * as Astropath from './astropath.mjs';
import * as Explorator from './explorator.mjs';

/**
 * Registry of all career advancement configurations
 * @type {Object<string, Object>}
 */
const CAREER_REGISTRY = {
  rogueTrader: RogueTrader,
  archMilitant: ArchMilitant,
  astropath: Astropath,
  explorator: Explorator
};

/**
 * Tier labels for characteristic advances
 * @type {Object<string, string>}
 */
export const ADVANCEMENT_TIERS = {
  simple: 'RT.Advancement.Tier.Simple',
  intermediate: 'RT.Advancement.Tier.Intermediate',
  trained: 'RT.Advancement.Tier.Trained',
  expert: 'RT.Advancement.Tier.Expert'
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
    name: career.CAREER_INFO?.name ?? key
  }));
}

/**
 * Check if a career exists in the registry
 * @param {string} careerKey - The career key to check
 * @returns {boolean}
 */
export function hasCareer(careerKey) {
  return careerKey in CAREER_REGISTRY;
}
