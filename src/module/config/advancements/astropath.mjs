/**
 * Astropath Transcendent Career Advancement Configuration
 * 
 * Defines characteristic costs and rank advancements for the Astropath Transcendent career.
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
  ballisticSkill: { simple: 500, intermediate: 750, trained: 1000, expert: 2500 },
  strength:       { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
  toughness:      { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
  agility:        { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
  intelligence:   { simple: 100, intermediate: 250, trained: 500, expert: 750 },
  perception:     { simple: 250, intermediate: 500, trained: 750, expert: 1000 },
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
  { name: 'Ciphers', cost: 100, type: 'skill', specialization: 'Astropath Sign', prerequisites: [] },
  { name: 'Common Lore', cost: 100, type: 'skill', specialization: 'Administratum', prerequisites: [] },
  { name: 'Common Lore', cost: 100, type: 'skill', specialization: 'Adeptus Astra Telepathica', prerequisites: [] },
  { name: 'Forbidden Lore', cost: 100, type: 'skill', specialization: 'Psykers', prerequisites: [] },
  { name: 'Forbidden Lore', cost: 100, type: 'skill', specialization: 'Warp', prerequisites: [] },
  { name: 'Invocation', cost: 100, type: 'skill', prerequisites: [] },
  { name: 'Literacy', cost: 100, type: 'skill', prerequisites: [] },
  { name: 'Psyniscience', cost: 100, type: 'skill', prerequisites: [] },
  { name: 'Scholastic Lore', cost: 100, type: 'skill', specialization: 'Cryptology', prerequisites: [] },
  { name: 'Scholastic Lore', cost: 100, type: 'skill', specialization: 'Occult', prerequisites: [] },
  { name: 'Secret Tongue', cost: 100, type: 'skill', specialization: 'Rogue Trader', prerequisites: [] },
  
  // Talents (100 XP)
  { 
    name: 'Psychic Technique', 
    cost: 100, 
    type: 'talent', 
    multiplier: 2,
    prerequisites: []
  },

  // Skills/Talents (200 XP)
  { name: 'Dodge', cost: 200, type: 'skill', prerequisites: [] },
  { 
    name: 'Heightened Senses', 
    cost: 200, 
    type: 'talent', 
    specialization: 'Sound',
    prerequisites: []
  },
  { 
    name: 'Psy Rating 2', 
    cost: 200, 
    type: 'talent', 
    prerequisites: []
  },
  { 
    name: 'Melee Weapon Training', 
    cost: 200, 
    type: 'talent', 
    specialization: 'Primitive',
    prerequisites: []
  },

  // Talents (500 XP)
  { 
    name: 'Pistol Weapon Training', 
    cost: 500, 
    type: 'talent', 
    specialization: 'Universal',
    prerequisites: []
  },
  { 
    name: 'Rite of Sanctioning', 
    cost: 500, 
    type: 'talent', 
    prerequisites: [{ type: 'talent', key: 'Psy Rating' }]
  },
  { 
    name: 'Warp Affinity', 
    cost: 500, 
    type: 'talent', 
    prerequisites: [{ type: 'talent', key: 'Psy Rating' }]
  }
];

/**
 * Career metadata
 */
export const CAREER_INFO = {
  key: 'astropath',
  name: 'RT.Career.Astropath',
  description: 'RT.Career.AstropathDesc',
  ranks: ['Rank 1', 'Rank 2', 'Rank 3', 'Rank 4', 'Rank 5', 'Rank 6', 'Rank 7', 'Rank 8']
};
