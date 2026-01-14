/**
 * Skill Key Helper - Robust skill name to key conversion and validation
 * 
 * Provides canonical mapping between skill display names and internal keys,
 * validates skill keys against actor schema, and identifies specialist skills.
 * 
 * All 51 Rogue Trader skills + 3 compatibility skills (athletics, parry, stealth).
 */

export class SkillKeyHelper {
  
  /**
   * Complete mapping of all skill display names to internal keys.
   * Based on SKILL_TABLE.md and creature.mjs schema.
   * @type {Object<string, string>}
   */
  static SKILL_NAME_TO_KEY = {
    // Standard Skills - Basic (22 skills)
    "Awareness": "awareness",
    "Barter": "barter",
    "Carouse": "carouse",
    "Charm": "charm",
    "Climb": "climb",
    "Command": "command",
    "Concealment": "concealment",
    "Contortionist": "contortionist",
    "Deceive": "deceive",
    "Disguise": "disguise",
    "Dodge": "dodge",
    "Evaluate": "evaluate",
    "Gamble": "gamble",
    "Inquiry": "inquiry",
    "Intimidate": "intimidate",
    "Literacy": "literacy",
    "Logic": "logic",
    "Scrutiny": "scrutiny",
    "Search": "search",
    "Silent Move": "silentMove",
    "Survival": "survival",
    "Swim": "swim",
    
    // Standard Skills - Advanced (14 skills)
    "Acrobatics": "acrobatics",
    "Blather": "blather",
    "Chem-Use": "chemUse",
    "Commerce": "commerce",
    "Demolition": "demolition",
    "Interrogation": "interrogation",
    "Invocation": "invocation",
    "Medicae": "medicae",
    "Psyniscience": "psyniscience",
    "Security": "security",
    "Shadowing": "shadowing",
    "Sleight of Hand": "sleightOfHand",
    "Tracking": "tracking",
    "Wrangling": "wrangling",
    
    // Specialist Skills - Advanced (12 skills)
    "Ciphers": "ciphers",
    "Common Lore": "commonLore",
    "Drive": "drive",
    "Forbidden Lore": "forbiddenLore",
    "Navigation": "navigation",
    "Performer": "performer",
    "Pilot": "pilot",
    "Scholastic Lore": "scholasticLore",
    "Secret Tongue": "secretTongue",
    "Speak Language": "speakLanguage",
    "Tech-Use": "techUse",
    "Trade": "trade",
    
    // Compatibility Skills - Basic (3 skills from other game lines)
    "Athletics": "athletics",
    "Parry": "parry",
    "Stealth": "stealth"
  };
  
  /**
   * Reverse mapping: key to display name.
   * @type {Object<string, string>}
   */
  static SKILL_KEY_TO_NAME = Object.fromEntries(
    Object.entries(this.SKILL_NAME_TO_KEY).map(([k, v]) => [v, k])
  );
  
  /**
   * Specialist skill keys (those with .entries arrays).
   * @type {Set<string>}
   */
  static SPECIALIST_KEYS = new Set([
    "ciphers", "commonLore", "drive", "forbiddenLore",
    "navigation", "performer", "pilot", "scholasticLore",
    "secretTongue", "speakLanguage", "techUse", "trade"
  ]);
  
  /**
   * Characteristic short names for each skill.
   * Maps skill key → characteristic abbreviation.
   * @type {Object<string, string>}
   */
  static SKILL_CHARACTERISTICS = {
    // Agility-based
    acrobatics: "Ag", concealment: "Ag", contortionist: "Ag", dodge: "Ag",
    security: "Ag", shadowing: "Ag", silentMove: "Ag", sleightOfHand: "Ag",
    drive: "Ag", pilot: "Ag", stealth: "Ag",
    
    // Strength-based
    climb: "S", intimidate: "S", swim: "S", athletics: "S",
    
    // Toughness-based
    carouse: "T",
    
    // Intelligence-based
    chemUse: "Int", demolition: "Int", evaluate: "Int", gamble: "Int",
    literacy: "Int", logic: "Int", medicae: "Int", survival: "Int",
    tracking: "Int", wrangling: "Int",
    ciphers: "Int", commonLore: "Int", forbiddenLore: "Int", navigation: "Int",
    scholasticLore: "Int", secretTongue: "Int", speakLanguage: "Int",
    techUse: "Int", trade: "Int",
    
    // Perception-based
    awareness: "Per", psyniscience: "Per", scrutiny: "Per", search: "Per",
    
    // Willpower-based
    interrogation: "WP", invocation: "WP",
    
    // Fellowship-based
    barter: "Fel", blather: "Fel", charm: "Fel", command: "Fel",
    commerce: "Fel", deceive: "Fel", disguise: "Fel", inquiry: "Fel",
    performer: "Fel",
    
    // Weapon Skill-based
    parry: "WS"
  };
  
  /**
   * Advanced/Basic classification for each skill.
   * Maps skill key → isAdvanced (true = Advanced, false = Basic).
   * @type {Object<string, boolean>}
   */
  static SKILL_TYPES = {
    // Standard skills - Advanced
    acrobatics: true, blather: true, chemUse: true, commerce: true, demolition: true,
    interrogation: true, invocation: true, medicae: true, psyniscience: true,
    security: true, shadowing: true, sleightOfHand: true, tracking: true, wrangling: true,
    
    // Standard skills - Basic
    awareness: false, barter: false, carouse: false, charm: false, climb: false,
    command: false, concealment: false, contortionist: false, deceive: false,
    disguise: false, dodge: false, evaluate: false, gamble: false, inquiry: false,
    intimidate: false, literacy: false, logic: false, scrutiny: false, search: false,
    silentMove: false, survival: false, swim: false,
    
    // Specialist skills - ALL Advanced
    ciphers: true, commonLore: true, drive: true, forbiddenLore: true, navigation: true,
    performer: true, pilot: true, scholasticLore: true, secretTongue: true,
    speakLanguage: true, techUse: true, trade: true,
    
    // Hidden compatibility skills - Basic
    athletics: false, parry: false, stealth: false
  };
  
  /* -------------------------------------------- */
  /*  Primary Methods                             */
  /* -------------------------------------------- */
  
  /**
   * Convert skill display name to internal key.
   * Uses canonical mapping with fallback to slugification.
   * 
   * @param {string} name - Skill display name (e.g., "Common Lore", "Chem-Use")
   * @returns {string} Internal key (e.g., "commonLore", "chemUse")
   * 
   * @example
   * SkillKeyHelper.nameToKey("Common Lore")  // → "commonLore"
   * SkillKeyHelper.nameToKey("Chem-Use")     // → "chemUse"
   * SkillKeyHelper.nameToKey("Unknown")      // → "unknown" (fallback)
   */
  static nameToKey(name) {
    if (!name || typeof name !== 'string') {
      console.warn(`SkillKeyHelper: Invalid skill name:`, name);
      return '';
    }
    
    const key = this.SKILL_NAME_TO_KEY[name];
    if (key) return key;
    
    // Fallback: slugify the name
    console.warn(`SkillKeyHelper: Unknown skill name "${name}", using slugified fallback`);
    return name
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/-/g, '')
      .replace(/[^a-z0-9]/g, '');
  }
  
  /**
   * Convert internal key to display name.
   * 
   * @param {string} key - Internal key (e.g., "commonLore")
   * @returns {string} Display name (e.g., "Common Lore")
   * 
   * @example
   * SkillKeyHelper.keyToName("commonLore")  // → "Common Lore"
   */
  static keyToName(key) {
    return this.SKILL_KEY_TO_NAME[key] || key;
  }
  
  /**
   * Validate that a skill key exists on the actor schema.
   * 
   * @param {string} key - Internal skill key
   * @param {Actor} actor - The actor to validate against
   * @returns {boolean} True if skill exists on actor.system.skills
   * 
   * @example
   * SkillKeyHelper.validateKey("awareness", actor)  // → true
   * SkillKeyHelper.validateKey("invalid", actor)    // → false
   */
  static validateKey(key, actor) {
    if (!actor?.system?.skills) return false;
    return actor.system.skills.hasOwnProperty(key);
  }
  
  /**
   * Check if a skill is a specialist type (has entries array).
   * Accepts either display name or internal key.
   * 
   * @param {string} keyOrName - Skill key or display name
   * @returns {boolean} True if specialist skill
   * 
   * @example
   * SkillKeyHelper.isSpecialist("commonLore")    // → true
   * SkillKeyHelper.isSpecialist("Common Lore")   // → true
   * SkillKeyHelper.isSpecialist("awareness")     // → false
   */
  static isSpecialist(keyOrName) {
    const key = this.SKILL_NAME_TO_KEY[keyOrName] || keyOrName;
    return this.SPECIALIST_KEYS.has(key);
  }
  
  /**
   * Get characteristic for a skill.
   * 
   * @param {string} keyOrName - Skill key or display name
   * @returns {string|null} Characteristic abbreviation (e.g., "Ag", "Int") or null
   * 
   * @example
   * SkillKeyHelper.getCharacteristic("dodge")      // → "Ag"
   * SkillKeyHelper.getCharacteristic("Medicae")    // → "Int"
   */
  static getCharacteristic(keyOrName) {
    const key = this.SKILL_NAME_TO_KEY[keyOrName] || keyOrName;
    return this.SKILL_CHARACTERISTICS[key] || null;
  }
  
  /**
   * Check if a skill is Advanced (true) or Basic (false).
   * 
   * @param {string} keyOrName - Skill key or display name
   * @returns {boolean} True if Advanced, false if Basic
   * 
   * @example
   * SkillKeyHelper.isAdvanced("acrobatics")  // → true
   * SkillKeyHelper.isAdvanced("awareness")   // → false
   */
  static isAdvanced(keyOrName) {
    const key = this.SKILL_NAME_TO_KEY[keyOrName] || keyOrName;
    return this.SKILL_TYPES[key] ?? false;
  }
  
  /* -------------------------------------------- */
  /*  Utility Methods                             */
  /* -------------------------------------------- */
  
  /**
   * Get all skill display names (for autocomplete, validation).
   * @returns {string[]} Array of all skill display names
   */
  static getAllSkillNames() {
    return Object.keys(this.SKILL_NAME_TO_KEY);
  }
  
  /**
   * Get all skill internal keys.
   * @returns {string[]} Array of all skill keys
   */
  static getAllSkillKeys() {
    return Object.values(this.SKILL_NAME_TO_KEY);
  }
  
  /**
   * Get all specialist skill keys.
   * @returns {string[]} Array of specialist skill keys
   */
  static getAllSpecialistKeys() {
    return Array.from(this.SPECIALIST_KEYS);
  }
  
  /**
   * Get all specialist skill display names.
   * @returns {string[]} Array of specialist skill names
   */
  static getAllSpecialistNames() {
    return this.getAllSpecialistKeys().map(key => this.keyToName(key));
  }
  
  /**
   * Find skills by characteristic.
   * 
   * @param {string} charShort - Characteristic abbreviation (e.g., "Ag", "Int")
   * @returns {Array<{key: string, name: string}>} Array of skills using that characteristic
   * 
   * @example
   * SkillKeyHelper.findSkillsByCharacteristic("Ag")
   * // → [{key: "acrobatics", name: "Acrobatics"}, {key: "dodge", name: "Dodge"}, ...]
   */
  static findSkillsByCharacteristic(charShort) {
    const results = [];
    for (const [key, char] of Object.entries(this.SKILL_CHARACTERISTICS)) {
      if (char === charShort) {
        results.push({ key, name: this.keyToName(key) });
      }
    }
    return results;
  }
  
  /**
   * Get complete skill metadata.
   * 
   * @param {string} keyOrName - Skill key or display name
   * @returns {Object|null} Complete metadata or null if not found
   * 
   * @example
   * SkillKeyHelper.getSkillMetadata("commonLore")
   * // → {
   * //   key: "commonLore",
   * //   name: "Common Lore",
   * //   characteristic: "Int",
   * //   isAdvanced: true,
   * //   isSpecialist: true
   * // }
   */
  static getSkillMetadata(keyOrName) {
    const key = this.SKILL_NAME_TO_KEY[keyOrName] || keyOrName;
    if (!this.SKILL_KEY_TO_NAME[key]) return null;
    
    return {
      key,
      name: this.keyToName(key),
      characteristic: this.getCharacteristic(key),
      isAdvanced: this.isAdvanced(key),
      isSpecialist: this.isSpecialist(key)
    };
  }
}
