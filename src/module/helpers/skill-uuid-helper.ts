/**
 * Skill UUID Helper
 *
 * Utility for looking up skill UUIDs from compendium packs.
 * Handles standard skills and specialist skills with specializations.
 *
 * @module helpers/skill-uuid-helper
 */

import { lineCategoryPack } from '../utils/line-packs.ts';
import { parseSpecializationName } from '../utils/specialization-name.ts';

// Re-export the canonical name parser under its historical name so existing
// consumers (and the e2e helper probe) keep resolving it from this module (#279).
export { parseSpecializationName as parseSkillName } from '../utils/specialization-name.ts';

/**
 * Cache for skill UUID lookups to avoid repeated compendium searches
 * @type {Map<string, string|null>}
 */
const _skillUuidCache = new Map<string, string | null>();

/**
 * Clear the skill UUID cache
 * Useful when compendium packs are reloaded or modified
 */
export function clearSkillUuidCache(): void {
    _skillUuidCache.clear();
}

/**
 * Find a skill UUID from the compendium
 *
 * Handles both standard skills and specialist skills:
 * - Standard: "Awareness", "Dodge", "Tech-Use"
 * - Specialist: "Common Lore (Imperium)", "Speak Language (Low Gothic)"
 *
 * @param {string} skillName - The skill name (e.g., "Awareness" or "Common Lore (Imperium)")
 * @param {string} [specialization=null] - Optional specialization (e.g., "Imperium")
 * @returns {Promise<string|null>} - Compendium UUID or null if not found
 *
 * @example
 * // Standard skill
 * const awarenessUuid = await findSkillUuid("Awareness", null, "dh2");
 * // Returns: "Compendium.wh40k-rpg.<dh2 skills pack>.xxx"
 *
 * @example
 * // Specialist skill with inline specialization
 * const loreUuid = await findSkillUuid("Common Lore (Imperium)", null, "dh2");
 * // Returns: "Compendium.wh40k-rpg.<dh2 skills pack>.yyy"
 *
 * @example
 * // Specialist skill with separate specialization parameter
 * const loreUuid = await findSkillUuid("Common Lore", "Imperium", "dh2");
 * // Returns: "Compendium.wh40k-rpg.<dh2 skills pack>.yyy"
 */
// eslint-disable-next-line complexity -- UUID lookup requires checking many skill key variants; refactor deferred
export function findSkillUuid(skillName: string | null | undefined, specialization: string | null = null, gameSystem?: string): string | null | undefined {
    if (skillName === null || skillName === undefined || skillName === '') return null;

    // Check if specialization is embedded in the name ("Skill Name (Specialization)").
    // Decomposition is owned by parseSpecializationName so the parse regex lives in one place (#279).
    let resolvedSkillName: string = skillName;
    let resolvedSpecialization: string | null = specialization;
    if ((resolvedSpecialization === null || resolvedSpecialization === '') && resolvedSkillName.includes('(') && resolvedSkillName.includes(')')) {
        const parsed = parseSpecializationName(resolvedSkillName);
        if (parsed.specialization !== null) {
            resolvedSkillName = parsed.name;
            resolvedSpecialization = parsed.specialization;
        }
    }

    // Build cache key — scoped by line so same-named skills in different systems don't collide.
    const line = gameSystem ?? '';
    const baseKey = resolvedSpecialization !== null && resolvedSpecialization !== '' ? `${resolvedSkillName}::${resolvedSpecialization}` : resolvedSkillName;
    const cacheKey = `${line}::${baseKey}`;

    // Check cache first
    if (_skillUuidCache.has(cacheKey)) {
        return _skillUuidCache.get(cacheKey);
    }

    try {
        // The skills pack is per-system; pick it by its flags for the actor's game
        // system so every line resolves (#279).
        const skillPack = lineCategoryPack(game.packs, line, 'skills');
        if (!skillPack) {
            console.warn(`Skill compendium pack for '${line}' not found`);
            _skillUuidCache.set(cacheKey, null);
            return null;
        }

        // Get pack index (lightweight metadata)
        const index = skillPack.index;

        // Build search variants
        const searchVariants = [];
        if (resolvedSpecialization !== null && resolvedSpecialization !== '') {
            // Try with parentheses
            searchVariants.push(`${resolvedSkillName} (${resolvedSpecialization})`);
            // Try without parentheses
            searchVariants.push(`${resolvedSkillName} ${resolvedSpecialization}`);
            // Try specialization first (some packs might use this format)
            searchVariants.push(`${resolvedSpecialization} ${resolvedSkillName}`);
        } else {
            searchVariants.push(resolvedSkillName);
        }

        // Try exact matches first
        for (const variant of searchVariants) {
            for (const [id, entry] of index.entries()) {
                if (entry.name === variant) {
                    const uuid = `Compendium.${skillPack.metadata.id}.${id}`;
                    _skillUuidCache.set(cacheKey, uuid);
                    return uuid;
                }
            }
        }

        // Try case-insensitive partial matches
        const skillNameLower = resolvedSkillName.toLowerCase();
        const specializationLower = resolvedSpecialization?.toLowerCase();

        for (const [id, entry] of index.entries()) {
            const entryNameLower = (entry.name ?? '').toLowerCase();

            // Check if entry name contains the skill name
            if (!entryNameLower.includes(skillNameLower)) continue;

            // If we have a specialization, check for that too
            if (specializationLower !== undefined && specializationLower !== '' && !entryNameLower.includes(specializationLower)) continue;

            // Found a match
            const uuid = `Compendium.${skillPack.metadata.id}.${id}`;
            _skillUuidCache.set(cacheKey, uuid);
            return uuid;
        }

        // No match found
        // eslint-disable-next-line no-console -- diagnostic: skill lookup miss is useful for compendium debugging
        console.debug(`Skill not found in compendium: ${cacheKey}`);
        _skillUuidCache.set(cacheKey, null);
        return null;
    } catch (error) {
        console.error('Error looking up skill UUID:', error);
        _skillUuidCache.set(cacheKey, null);
        return null;
    }
}

// parseSkillName now lives in utils/specialization-name.ts as parseSpecializationName
// (the inverse of composeSpecializationName) and is re-exported above (#279).
