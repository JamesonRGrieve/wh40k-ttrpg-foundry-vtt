/**
 * Skill Key Helper - Robust skill name to key conversion and validation
 *
 * Provides canonical mapping between skill display names and internal keys,
 * validates skill keys against actor schema, and identifies specialist skills.
 *
 * The four lookup maps (name→key, specialist keys, characteristics, advanced
 * flags) are all DERIVED from the canonical `SKILL_DEFINITIONS` catalog in
 * `data/shared/skill-definitions.ts` (#273) — never hand-maintained here — so the
 * label / characteristic / advanced / specialist facts live in exactly one place
 * and cannot drift between this helper and the schema.
 */

import {
    skillAdvancedMap,
    skillCharacteristicShortMap,
    skillNameToKeyMap,
    specialistSkillKeys,
} from '../data/shared/skill-definitions.ts';
import type { WH40KBaseActorDocument } from '../types/global.d.ts';

// biome-ignore lint/complexity/noStaticOnlyClass: stable API surface with many callers across the codebase
export class SkillKeyHelper {
    /**
     * Mapping of all skill display names to internal keys.
     * Derived from the canonical `SKILL_DEFINITIONS` catalog (#273).
     */
    static SKILL_NAME_TO_KEY: Record<string, string> = skillNameToKeyMap();

    /**
     * Reverse mapping: key to display name.
     */
    static SKILL_KEY_TO_NAME: Record<string, string> = Object.fromEntries(Object.entries(this.SKILL_NAME_TO_KEY).map(([k, v]) => [v, k]));

    /**
     * Specialist skill keys (those with `.entries` arrays).
     * Derived from the catalog entries flagged `hasEntries` (#273).
     */
    static SPECIALIST_KEYS: Set<string> = specialistSkillKeys();

    /**
     * Characteristic short names for each skill (skill key → abbreviation).
     * Derived from the catalog's `char` field (#273).
     */
    static SKILL_CHARACTERISTICS: Record<string, string> = skillCharacteristicShortMap();

    /**
     * Advanced/Basic classification for each skill (skill key → isAdvanced).
     * Derived from the catalog's `advanced` field (#273).
     */
    static SKILL_TYPES: Record<string, boolean> = skillAdvancedMap();

    static #lookupKey(value: string): string {
        return this.SKILL_NAME_TO_KEY[value] ?? value;
    }

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
    static nameToKey(name: string): string {
        if (!name || typeof name !== 'string') {
            console.warn(`SkillKeyHelper: Invalid skill name:`, name);
            return '';
        }

        const key = this.SKILL_NAME_TO_KEY[name];
        if (key !== undefined) return key;

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
    static keyToName(key: string): string {
        return this.SKILL_KEY_TO_NAME[key] ?? key;
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
    static validateKey(key: string, actor: WH40KBaseActorDocument): boolean {
        return Object.hasOwn(actor.system.skills, key);
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
    static isSpecialist(keyOrName: string): boolean {
        const key = this.#lookupKey(keyOrName);
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
    static getCharacteristic(keyOrName: string): string | null {
        const key = this.#lookupKey(keyOrName);
        return this.SKILL_CHARACTERISTICS[key] ?? null;
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
    static isAdvanced(keyOrName: string): boolean {
        const key = this.#lookupKey(keyOrName);
        return this.SKILL_TYPES[key] ?? false;
    }

    /* -------------------------------------------- */
    /*  Utility Methods                             */
    /* -------------------------------------------- */

    /**
     * Get all skill display names (for autocomplete, validation).
     * @returns {string[]} Array of all skill display names
     */
    static getAllSkillNames(): string[] {
        return Object.keys(this.SKILL_NAME_TO_KEY);
    }

    /**
     * Get all skill internal keys.
     * @returns {string[]} Array of all skill keys
     */
    static getAllSkillKeys(): string[] {
        return Object.values(this.SKILL_NAME_TO_KEY);
    }

    /**
     * Get all specialist skill keys.
     * @returns {string[]} Array of specialist skill keys
     */
    static getAllSpecialistKeys(): string[] {
        return Array.from(this.SPECIALIST_KEYS);
    }

    /**
     * Get all specialist skill display names.
     * @returns {string[]} Array of specialist skill names
     */
    static getAllSpecialistNames(): string[] {
        return this.getAllSpecialistKeys().map((key) => this.keyToName(key));
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
    static findSkillsByCharacteristic(charShort: string): Array<{ key: string; name: string }> {
        const results: Array<{ key: string; name: string }> = [];
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
    static getSkillMetadata(keyOrName: string): {
        key: string;
        name: string;
        characteristic: string | null;
        isAdvanced: boolean;
        isSpecialist: boolean;
    } | null {
        const key = this.#lookupKey(keyOrName);
        if (this.SKILL_KEY_TO_NAME[key] === undefined) return null;

        return {
            key,
            name: this.keyToName(key),
            characteristic: this.getCharacteristic(key),
            isAdvanced: this.isAdvanced(key),
            isSpecialist: this.isSpecialist(key),
        };
    }
}
