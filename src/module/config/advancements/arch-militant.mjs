/**
 * Arch-Militant Career Advancement Configuration
 * 
 * Defines characteristic costs and rank advancements for the Arch-Militant career.
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
  ballisticSkill: { simple: 100, intermediate: 250, trained: 500, expert: 750 },
  strength:       { simple: 100, intermediate: 250, trained: 500, expert: 750 },
  toughness:      { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
  agility:        { simple: 100, intermediate: 250, trained: 500, expert: 750 },
  intelligence:   { simple: 500, intermediate: 750, trained: 1000, expert: 2500 },
  perception:     { simple: 500, intermediate: 750, trained: 1000, expert: 2500 },
  willpower:      { simple: 500, intermediate: 750, trained: 1000, expert: 2500 },
  fellowship:     { simple: 250, intermediate: 500, trained: 750, expert: 1000 }
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
  { name: 'Common Lore', cost: 100, type: 'skill', specialization: 'Imperial Guard', prerequisites: [] },
  { name: 'Common Lore', cost: 100, type: 'skill', specialization: 'War', prerequisites: [] },
  { name: 'Dodge', cost: 100, type: 'skill', prerequisites: [] },
  { name: 'Intimidate', cost: 100, type: 'skill', prerequisites: [] },
  { name: 'Forbidden Lore', cost: 100, type: 'skill', specialization: 'Pirates', prerequisites: [] },
  { name: 'Literacy', cost: 100, type: 'skill', prerequisites: [] },
  { name: 'Scholastic Lore', cost: 100, type: 'skill', specialization: 'Tactica Imperialis', prerequisites: [] },
  { name: 'Secret Tongue', cost: 100, type: 'skill', specialization: 'Military', prerequisites: [] },
  { name: 'Secret Tongue', cost: 100, type: 'skill', specialization: 'Rogue Trader', prerequisites: [] },

  // Talents (200 XP)
  { 
    name: 'Ambidextrous', 
    cost: 200, 
    type: 'talent', 
    prerequisites: [{ type: 'characteristic', key: 'agility', value: 30 }]
  },
  { name: 'Quick Draw', cost: 200, type: 'talent', prerequisites: [] },
  { name: 'Medicae', cost: 200, type: 'skill', prerequisites: [] },
  { 
    name: 'Melee Weapon Training', 
    cost: 200, 
    type: 'talent', 
    specialization: 'Primitive',
    prerequisites: []
  },

  // Talents (500 XP)
  { 
    name: 'Basic Weapon Training', 
    cost: 500, 
    type: 'talent', 
    specialization: 'Universal',
    prerequisites: []
  },
  { name: 'Bloodtracker', cost: 500, type: 'talent', prerequisites: [] },
  { 
    name: 'Guardian', 
    cost: 500, 
    type: 'talent', 
    prerequisites: [{ type: 'characteristic', key: 'agility', value: 40 }]
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
  },
  { 
    name: 'Thrown Weapon Training', 
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
  key: 'archMilitant',
  name: 'RT.Career.ArchMilitant',
  description: 'RT.Career.ArchMilitantDesc',
  ranks: ['Rank 1', 'Rank 2', 'Rank 3', 'Rank 4', 'Rank 5', 'Rank 6', 'Rank 7', 'Rank 8']
};
