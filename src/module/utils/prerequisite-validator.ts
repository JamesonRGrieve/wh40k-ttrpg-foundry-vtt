/**
 * Prerequisite Validator
 *
 * Validates prerequisites for advancement purchases.
 * Returns validation results with human-readable failure reasons.
 */

import type { WH40KBaseActorDocument, WH40KSkill, WH40KSkillEntry } from '../types/global.d.ts';

type Prerequisite = {
    type: 'characteristic' | 'skill' | 'talent';
    key: string;
    value?: number;
};

type ValidationResult = {
    valid: boolean;
    unmet: string[];
};

type SinglePrerequisiteResult = {
    valid: boolean;
    reason?: string;
};

type CharacteristicAbbreviation = keyof typeof CHAR_ABBREVIATIONS;

type SkillLike = WH40KSkill | WH40KSkillEntry;

/**
 * @typedef {Object} Prerequisite
 * @property {'characteristic'|'skill'|'talent'} type - Type of prerequisite
 * @property {string} key - Characteristic key, skill name, or talent name
 * @property {number} [value] - Required value (for characteristics)
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether all prerequisites are met
 * @property {string[]} unmet - Array of human-readable unmet requirement descriptions
 */

/**
 * Characteristic key mapping from abbreviations to full keys
 */
const CHAR_ABBREVIATIONS = {
    ws: 'weaponSkill',
    bs: 'ballisticSkill',
    s: 'strength',
    str: 'strength',
    t: 'toughness',
    tou: 'toughness',
    ag: 'agility',
    agi: 'agility',
    int: 'intelligence',
    per: 'perception',
    wp: 'willpower',
    wil: 'willpower',
    fel: 'fellowship',
};

/**
 * Normalize characteristic key from various formats
 * @param {string} key - Input key (e.g., 'Fel', 'fellowship', 'Fellowship')
 * @returns {string} Normalized key (e.g., 'fellowship')
 */
function normalizeCharacteristicKey(key: string): string {
    const lower = key.toLowerCase();
    return lower in CHAR_ABBREVIATIONS ? CHAR_ABBREVIATIONS[lower as CharacteristicAbbreviation] : lower;
}

/**
 * Check if actor meets all prerequisites for an advancement
 * @param {Actor} actor - The actor to check
 * @param {Prerequisite[]} prerequisites - Array of prerequisites to check
 * @returns {ValidationResult} Validation result
 */
export function checkPrerequisites(actor: WH40KBaseActorDocument, prerequisites: Prerequisite[]): ValidationResult {
    if (prerequisites.length === 0) {
        return { valid: true, unmet: [] };
    }

    const unmet: string[] = [];

    for (const prereq of prerequisites) {
        const result = checkSinglePrerequisite(actor, prereq);
        if (!result.valid && result.reason !== undefined) {
            unmet.push(result.reason);
        }
    }

    return {
        valid: unmet.length === 0,
        unmet,
    };
}

/**
 * Check a single prerequisite
 * @param {Actor} actor - The actor to check
 * @param {Prerequisite} prereq - The prerequisite to check
 * @returns {{valid: boolean, reason?: string}}
 */
function checkSinglePrerequisite(actor: WH40KBaseActorDocument, prereq: Prerequisite): SinglePrerequisiteResult {
    switch (prereq.type) {
        case 'characteristic':
            return checkCharacteristicPrereq(actor, prereq);
        case 'skill':
            return checkSkillPrereq(actor, prereq);
        case 'talent':
            return checkTalentPrereq(actor, prereq);
        default:
            console.warn('Unknown prerequisite type:', prereq.type);
            return { valid: true }; // Unknown types pass by default
    }
}

/**
 * Check characteristic prerequisite (e.g., Fellowship 30)
 * @param {Actor} actor
 * @param {Prerequisite} prereq
 * @returns {{valid: boolean, reason?: string}}
 */
function checkCharacteristicPrereq(actor: WH40KBaseActorDocument, prereq: Prerequisite): SinglePrerequisiteResult {
    const charKey = normalizeCharacteristicKey(prereq.key);
    const characteristic = actor.system.characteristics[charKey];

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime safety: key may be absent despite schema
    if (characteristic === undefined) {
        return {
            valid: false,
            reason: `Unknown characteristic: ${prereq.key}`,
        };
    }

    const currentValue = characteristic.total;
    const requiredValue = prereq.value ?? 0;

    if (currentValue >= requiredValue) {
        return { valid: true };
    }

    // Get display name for the characteristic — key may be absent at runtime despite schema typing
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    const charLabel = CONFIG.wh40k.characteristics[charKey]?.abbreviation ?? prereq.key;

    return {
        valid: false,
        reason: game.i18n.format('WH40K.Advancement.Prereq.Characteristic', {
            char: charLabel,
            required: String(requiredValue),
            current: String(currentValue),
        }),
    };
}

/**
 * Check skill prerequisite (actor must have skill trained)
 * @param {Actor} actor
 * @param {Prerequisite} prereq
 * @returns {{valid: boolean, reason?: string}}
 */
function checkSkillPrereq(actor: WH40KBaseActorDocument, prereq: Prerequisite): SinglePrerequisiteResult {
    const skillName = prereq.key;
    const requiredLevel = prereq.value === 20 ? 'plus20' : prereq.value === 10 ? 'plus10' : 'trained';

    // Find the skill on the actor
    const skill = findSkill(actor, skillName);

    if (!skill) {
        return {
            valid: false,
            reason: game.i18n.format('WH40K.Advancement.Prereq.SkillMissing', { skill: skillName }),
        };
    }

    // Check training level
    const hasRequired = checkSkillLevel(skill, requiredLevel);

    if (hasRequired) {
        return { valid: true };
    }

    return {
        valid: false,
        reason: game.i18n.format('WH40K.Advancement.Prereq.SkillLevel', {
            skill: skillName,
            level: requiredLevel,
        }),
    };
}

/**
 * Check talent prerequisite (actor must have the talent)
 * @param {Actor} actor
 * @param {Prerequisite} prereq
 * @returns {{valid: boolean, reason?: string}}
 */
function checkTalentPrereq(actor: WH40KBaseActorDocument, prereq: Prerequisite): SinglePrerequisiteResult {
    const talentName = prereq.key.toLowerCase();

    // Check if actor has the talent as an item
    const hasTalent = actor.items.some((item) => item.type === 'talent' && item.name.toLowerCase() === talentName);

    if (hasTalent) {
        return { valid: true };
    }

    return {
        valid: false,
        reason: game.i18n.format('WH40K.Advancement.Prereq.TalentMissing', { talent: prereq.key }),
    };
}

/**
 * Find a skill on an actor by name
 * Handles both standard skills and specialist skills with entries
 * @param {Actor} actor
 * @param {string} skillName - Skill name, optionally with specialization in parentheses
 * @returns {Object|null} The skill object or null
 */
function findSkill(actor: WH40KBaseActorDocument, skillName: string): SkillLike | null {
    const skills = actor.system.skills;

    // Parse skill name and optional specialization
    const match = skillName.match(/^(.+?)\s*(?:\((.+)\))?$/);
    if (!match) return null;

    const baseName = match[1].trim().toLowerCase();
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess not set; match[2] is undefined when group 2 didn't participate
    const specialization: string | undefined = match[2] !== undefined ? match[2].trim().toLowerCase() : undefined;

    // Map common skill names to system keys
    const skillKey = getSkillKey(baseName);
    const skill = skills[skillKey];

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime safety: key may be absent despite schema
    if (skill === undefined) return null;

    // If no specialization needed, return the base skill
    if (specialization === undefined) {
        return skill;
    }

    // For specialist skills, find the entry
    if (skill.entries !== undefined) {
        return (
            skill.entries.find((entry: WH40KSkillEntry) => entry.name.toLowerCase() === specialization || entry.slug.toLowerCase() === specialization) ?? null
        );
    }

    return null;
}

/**
 * Convert skill name to system key
 * @param {string} name - Skill display name
 * @returns {string} System skill key
 */
function getSkillKey(name: string): string {
    // Common mappings
    const mappings: Record<string, string> = {
        'common lore': 'commonLore',
        'scholastic lore': 'scholasticLore',
        'forbidden lore': 'forbiddenLore',
        'speak language': 'speakLanguage',
        'secret tongue': 'secretTongue',
        'trade': 'trade',
        'pilot': 'pilot',
        'drive': 'drive',
        'navigate': 'navigate',
        'awareness': 'awareness',
        'command': 'command',
        'commerce': 'commerce',
        'charm': 'charm',
        'ciphers': 'ciphers',
        'dodge': 'dodge',
        'evaluate': 'evaluate',
        'literacy': 'literacy',
    };

    return mappings[name] ?? name.replace(/\s+/g, '');
}

/**
 * Check if a skill meets the required training level
 * @param {Object} skill - Skill data object
 * @param {string} requiredLevel - 'trained', 'plus10', or 'plus20'
 * @returns {boolean}
 */
function checkSkillLevel(skill: SkillLike, requiredLevel: 'trained' | 'plus10' | 'plus20'): boolean {
    switch (requiredLevel) {
        case 'plus20':
            return skill.plus20;
        case 'plus10':
            return skill.plus10 || skill.plus20;
        case 'trained':
        default:
            return skill.trained || skill.plus10 || skill.plus20;
    }
}

/**
 * Parse a prerequisite string from CSV format
 * Examples: "Fel 30", "WS 40", "Command"
 * @param {string} prereqString - Raw prerequisite string
 * @returns {Prerequisite|null}
 */
export function parsePrerequisiteString(prereqString: string): Prerequisite | null {
    if (prereqString.trim() === '') {
        return null;
    }

    const trimmed = prereqString.trim();

    // Check for characteristic prerequisite pattern: "Fel 30", "WS 40"
    const charMatch = trimmed.match(/^([A-Za-z]+)\s+(\d+)$/);
    if (charMatch) {
        return {
            type: 'characteristic',
            key: charMatch[1],
            value: parseInt(charMatch[2], 10),
        };
    }

    // Otherwise assume it's a skill or talent name
    // Could be refined with more context
    return {
        type: 'skill',
        key: trimmed,
    };
}
