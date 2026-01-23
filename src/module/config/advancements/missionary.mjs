/**
 * Missionary Career Advancement Configuration
 * 
 * Defines characteristic costs and rank advancements for the Missionary career.
 * Data sourced from Rogue Trader Core Rulebook.
 */

/**
 * Characteristic advancement costs by tier.
 * Each characteristic can be advanced 4 times (+5 each = +20 total).
 * Tiers: Simple (1st), Intermediate (2nd), Trained (3rd), Expert (4th)
 * @type {Object<string, {simple: number, intermediate: number, trained: number, expert: number}>}
 */
export const CHARACTERISTIC_COSTS = {
  weaponSkill:    { simple: 100, intermediate: 250, trained: 500, expert: 750 },
  ballisticSkill: { simple: 500, intermediate: 750, trained: 1000, expert: 2500 },
  strength:       { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
  toughness:      { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
  agility:        { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
  intelligence:   { simple: 500, intermediate: 750, trained: 1000, expert: 2500 },
  perception:     { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
  willpower:      { simple: 100, intermediate: 250, trained: 500, expert: 750 },
  fellowship:     { simple: 100, intermediate: 250, trained: 500, expert: 750 }
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
  { name: 'Charm', cost: 100, type: 'skill', prerequisites: [] },
  { name: 'Common Lore', cost: 100, type: 'skill', specialization: 'Ecclesiarchy', prerequisites: [] },
  { name: 'Common Lore', cost: 100, type: 'skill', specialization: 'Imperial Creed', prerequisites: [] },
  { name: 'Common Lore', cost: 100, type: 'skill', specialization: 'Imperium', prerequisites: [] },
  { name: 'Dodge', cost: 100, type: 'skill', prerequisites: [] },
  { name: 'Forbidden Lore', cost: 100, type: 'skill', specialization: 'Heresy', prerequisites: [] },
  { name: 'Literacy', cost: 100, type: 'skill', prerequisites: [] },
  { name: 'Medicae', cost: 100, type: 'skill', prerequisites: [] },
  { name: 'Performer', cost: 100, type: 'skill', specialization: 'Choose One', prerequisites: [] },
  { name: 'Scholastic Lore', cost: 100, type: 'skill', specialization: 'Imperial Creed', prerequisites: [] },
  { name: 'Secret Tongue', cost: 100, type: 'skill', specialization: 'Ecclesiarchy', prerequisites: [] },
  { name: 'Secret Tongue', cost: 100, type: 'skill', specialization: 'Rogue Trader', prerequisites: [] },

  // Talents (100 XP)
  { 
    name: 'Melee Weapon Training', 
    cost: 100, 
    type: 'talent', 
    specialization: 'Primitive',
    prerequisites: []
  },

  // Talents (200 XP)
  { name: 'Sound Constitution', cost: 200, type: 'talent', prerequisites: [] },
  { name: 'Unshakeable Faith', cost: 200, type: 'talent', prerequisites: [] },

  // Talents (500 XP)
  { 
    name: 'Basic Weapon Training', 
    cost: 500, 
    type: 'talent', 
    specialization: 'Universal',
    prerequisites: []
  },
  { 
    name: 'Flame Weapon Training', 
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
  },
  { name: 'Pure Faith', cost: 500, type: 'talent', prerequisites: [] }
];

/**
 * Career metadata
 */
export const CAREER_INFO = {
  key: 'missionary',
  name: 'RT.Career.Missionary',
  description: 'RT.Career.MissionaryDesc',
  ranks: ['Rank 1', 'Rank 2', 'Rank 3', 'Rank 4', 'Rank 5', 'Rank 6', 'Rank 7', 'Rank 8']
};
