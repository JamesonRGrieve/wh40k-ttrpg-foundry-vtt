/**
 * Explorator Career Advancement Configuration
 * 
 * Defines characteristic costs and rank advancements for the Explorator career.
 * Data sourced from Rogue Trader Core Rulebook.
 */

/**
 * Characteristic advancement costs by tier.
 * Each characteristic can be advanced 4 times (+5 each = +20 total).
 * Tiers: Simple (1st), Intermediate (2nd), Trained (3rd), Expert (4th)
 * @type {Object<string, {simple: number, intermediate: number, trained: number, expert: number}>}
 */
export const CHARACTERISTIC_COSTS = {
  weaponSkill:    { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
  ballisticSkill: { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
  strength:       { simple: 100, intermediate: 250, trained: 500, expert: 750 },
  toughness:      { simple: 100, intermediate: 250, trained: 500, expert: 750 },
  agility:        { simple: 500, intermediate: 750, trained: 1000, expert: 2500 },
  intelligence:   { simple: 100, intermediate: 250, trained: 500, expert: 750 },
  perception:     { simple: 500, intermediate: 750, trained: 1000, expert: 2500 },
  willpower:      { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
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
  { name: 'Common Lore', cost: 100, type: 'skill', specialization: 'Machine Cult', prerequisites: [] },
  { name: 'Common Lore', cost: 100, type: 'skill', specialization: 'Tech', prerequisites: [] },
  { name: 'Drive', cost: 100, type: 'skill', specialization: 'Ground Vehicle', prerequisites: [] },
  { name: 'Forbidden Lore', cost: 100, type: 'skill', specialization: 'Archeotech', prerequisites: [] },
  { name: 'Forbidden Lore', cost: 100, type: 'skill', specialization: 'Adeptus Mechanicus', prerequisites: [] },
  { name: 'Literacy', cost: 100, type: 'skill', prerequisites: [] },
  { name: 'Logic', cost: 100, type: 'skill', prerequisites: [] },
  { name: 'Scholastic Lore', cost: 100, type: 'skill', specialization: 'Astromancy', prerequisites: [] },
  { name: 'Secret Tongue', cost: 100, type: 'skill', specialization: 'Rogue Trader', prerequisites: [] },
  { name: 'Secret Tongue', cost: 100, type: 'skill', specialization: 'Tech', prerequisites: [] },
  { name: 'Tech-Use', cost: 100, type: 'skill', prerequisites: [] },
  { name: 'Trade', cost: 100, type: 'skill', specialization: 'Armourer', prerequisites: [] },
  { name: 'Trade', cost: 100, type: 'skill', specialization: 'Technomat', prerequisites: [] },

  // Talents (200 XP)
  { name: 'Autosanguine', cost: 200, type: 'talent', prerequisites: [] },
  { name: 'Logis Implant', cost: 200, type: 'talent', prerequisites: [] },
  { 
    name: 'Sound Constitution', 
    cost: 200, 
    type: 'talent', 
    multiplier: 2,
    prerequisites: []
  },

  // Talents (500 XP)
  { 
    name: 'Mechadendrite Use', 
    cost: 500, 
    type: 'talent', 
    specialization: 'Utility',
    prerequisites: [{ type: 'trait', key: 'Mechanicus Implants' }]
  },
  { 
    name: 'Basic Weapon Training', 
    cost: 500, 
    type: 'talent', 
    specialization: 'Universal',
    prerequisites: []
  },
  { 
    name: 'Melee Weapon Training', 
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
  key: 'explorator',
  name: 'RT.Career.Explorator',
  description: 'RT.Career.ExploratorDesc',
  ranks: ['Rank 1', 'Rank 2', 'Rank 3', 'Rank 4', 'Rank 5', 'Rank 6', 'Rank 7', 'Rank 8']
};
