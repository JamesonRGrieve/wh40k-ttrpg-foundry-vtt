/**
 * Rogue Trader Career Advancement Configuration
 * 
 * Defines characteristic costs and rank advancements for the Rogue Trader career.
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
  ballisticSkill: { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
  strength:       { simple: 500, intermediate: 750, trained: 1000, expert: 2500 },
  toughness:      { simple: 500, intermediate: 750, trained: 1000, expert: 2500 },
  agility:        { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
  intelligence:   { simple: 100, intermediate: 250, trained: 500, expert: 750 },
  perception:     { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
  willpower:      { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
  fellowship:     { simple: 100, intermediate: 250, trained: 500, expert: 750 }
};

/**
 * Tier order for characteristic advances
 * @type {string[]}
 */
export const TIER_ORDER = ['simple', 'intermediate', 'trained', 'expert'];

/**
 * Rank 1 skill and talent advancements.
 * @type {Array<{name: string, cost: number, type: 'skill'|'talent', prerequisites: Array, multiplier?: number, specialization?: string}>}
 */
export const RANK_1_ADVANCES = [
  // Skills (no prerequisites)
  { name: 'Awareness', cost: 100, type: 'skill', prerequisites: [] },
  { name: 'Command', cost: 100, type: 'skill', prerequisites: [] },
  { name: 'Commerce', cost: 100, type: 'skill', prerequisites: [] },
  { name: 'Charm', cost: 100, type: 'skill', prerequisites: [] },
  { name: 'Ciphers', cost: 100, type: 'skill', specialization: 'Rogue Trader', prerequisites: [] },
  { name: 'Common Lore', cost: 100, type: 'skill', specialization: 'Imperium', prerequisites: [] },
  { name: 'Common Lore', cost: 100, type: 'skill', specialization: 'Rogue Traders', prerequisites: [] },
  { name: 'Dodge', cost: 100, type: 'skill', prerequisites: [] },
  { name: 'Evaluate', cost: 100, type: 'skill', prerequisites: [] },
  { name: 'Literacy', cost: 100, type: 'skill', prerequisites: [] },
  { name: 'Pilot', cost: 100, type: 'skill', specialization: 'Space Craft', prerequisites: [] },
  { name: 'Scholastic Lore', cost: 100, type: 'skill', specialization: 'Astromancy', prerequisites: [] },
  { name: 'Secret Tongue', cost: 100, type: 'skill', specialization: 'Rogue Trader', prerequisites: [] },
  { name: 'Speak Language', cost: 100, type: 'skill', specialization: 'Trader\'s Cant', prerequisites: [] },

  // Talents
  { 
    name: 'Air of Authority', 
    cost: 100, 
    type: 'talent', 
    prerequisites: [{ type: 'characteristic', key: 'fellowship', value: 30 }]
  },
  { 
    name: 'Ambidextrous', 
    cost: 200, 
    type: 'talent', 
    prerequisites: [{ type: 'characteristic', key: 'agility', value: 30 }]
  },
  { 
    name: 'Melee Weapon Training', 
    cost: 200, 
    type: 'talent', 
    specialization: 'Primitive',
    prerequisites: []
  },
  { 
    name: 'Renowned Warrant', 
    cost: 200, 
    type: 'talent', 
    prerequisites: []
  },
  { 
    name: 'Pistol Weapon Training', 
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
  key: 'rogueTrader',
  name: 'RT.Career.RogueTrader',
  description: 'RT.Career.RogueTraderDesc',
  ranks: ['Rank 1', 'Rank 2', 'Rank 3', 'Rank 4', 'Rank 5', 'Rank 6', 'Rank 7', 'Rank 8']
};
