/**
 * Navigator Career Advancement Configuration
 * 
 * Defines characteristic costs and rank advancements for the Navigator career.
 * Data sourced from Rogue Trader Core Rulebook.
 */

/**
 * Characteristic advancement costs by tier.
 * Each characteristic can be advanced 4 times (+5 each = +20 total).
 * Tiers: Simple (1st), Intermediate (2nd), Trained (3rd), Expert (4th)
 * @type {Object<string, {simple: number, intermediate: number, trained: number, expert: number}>}
 */
export const CHARACTERISTIC_COSTS = {
  weaponSkill:    { simple: 500, intermediate: 750, trained: 1000, expert: 2500 },
  ballisticSkill: { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
  strength:       { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
  toughness:      { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
  agility:        { simple: 500, intermediate: 750, trained: 1000, expert: 2500 },
  intelligence:   { simple: 100, intermediate: 250, trained: 500, expert: 750 },
  perception:     { simple: 100, intermediate: 250, trained: 500, expert: 750 },
  willpower:      { simple: 100, intermediate: 250, trained: 500, expert: 750 },
  fellowship:     { simple: 500, intermediate: 750, trained: 1000, expert: 2500 }
};

/**
 * Tier order for characteristic advances
 * @type {string[]}
 */
export const TIER_ORDER = ['simple', 'intermediate', 'trained', 'expert'];

/**
 * Rank 1 skill and talent advancements.
 * @type {Array<{name: string, cost: number, type: 'skill'|'talent', prerequisites: Array, specialization?: string}>}
 */
export const RANK_1_ADVANCES = [
  // Skills (100 XP)
  { name: 'Awareness', cost: 100, type: 'skill', prerequisites: [] },
  { name: 'Ciphers', cost: 100, type: 'skill', specialization: 'Nobilite Family', prerequisites: [] },
  { name: 'Common Lore', cost: 100, type: 'skill', specialization: 'Navis Nobilite', prerequisites: [] },
  { name: 'Common Lore', cost: 100, type: 'skill', specialization: 'Imperial Navy', prerequisites: [] },
  { name: 'Forbidden Lore', cost: 100, type: 'skill', specialization: 'Navigators', prerequisites: [] },
  { name: 'Forbidden Lore', cost: 100, type: 'skill', specialization: 'Warp', prerequisites: [] },
  { name: 'Intimidate', cost: 100, type: 'skill', prerequisites: [] },
  { name: 'Literacy', cost: 100, type: 'skill', prerequisites: [] },
  { name: 'Navigation', cost: 100, type: 'skill', specialization: 'Stellar', prerequisites: [] },
  { name: 'Navigation', cost: 100, type: 'skill', specialization: 'Warp', prerequisites: [] },
  { name: 'Psyniscience', cost: 100, type: 'skill', prerequisites: [] },
  { name: 'Scholastic Lore', cost: 100, type: 'skill', specialization: 'Astromancy', prerequisites: [] },
  { name: 'Secret Tongue', cost: 100, type: 'skill', specialization: 'Rogue Trader', prerequisites: [] },
  { 
    name: 'Secret Tongue', 
    cost: 100, 
    type: 'skill', 
    specialization: 'Navigator',
    prerequisites: [{ type: 'characteristic', key: 'fellowship', value: 30 }]
  },
  { name: 'Trade', cost: 100, type: 'skill', specialization: 'Astrographer', prerequisites: [] },

  // Talents (100 XP)
  { 
    name: 'Melee Weapon Training', 
    cost: 100, 
    type: 'talent', 
    specialization: 'Primitive',
    prerequisites: []
  },

  // Talents (200 XP)
  { 
    name: 'Resistance', 
    cost: 200, 
    type: 'talent', 
    specialization: 'Fear',
    prerequisites: []
  },
  { name: 'Sound Constitution', cost: 200, type: 'talent', prerequisites: [] },

  // Talents (500 XP)
  { name: 'Navigator', cost: 500, type: 'talent', prerequisites: [] },
  { 
    name: 'Pistol Weapon Training', 
    cost: 500, 
    type: 'talent', 
    specialization: 'Universal',
    prerequisites: []
  }
];

/**
 * Career metadata
 */
export const CAREER_INFO = {
  key: 'navigator',
  name: 'RT.Career.Navigator',
  description: 'RT.Career.NavigatorDesc',
  ranks: ['Rank 1', 'Rank 2', 'Rank 3', 'Rank 4', 'Rank 5', 'Rank 6', 'Rank 7', 'Rank 8']
};
