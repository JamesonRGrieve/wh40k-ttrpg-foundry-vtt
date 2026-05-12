/**
 * Skill UUID Helper
 *
 * Utility for looking up skill UUIDs from compendium packs.
 * Handles standard skills and specialist skills with specializations.
 *
 * @module helpers/skill-uuid-helper
 */

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
 * const awarenessUuid = await findSkillUuid("Awareness");
 * // Returns: "Compendium.wh40k-rpg.dh2-core-stats-skills.xxx"
 *
 * @example
 * // Specialist skill with inline specialization
 * const loreUuid = await findSkillUuid("Common Lore (Imperium)");
 * // Returns: "Compendium.wh40k-rpg.dh2-core-stats-skills.yyy"
 *
 * @example
 * // Specialist skill with separate specialization parameter
 * const loreUuid = await findSkillUuid("Common Lore", "Imperium");
 * // Returns: "Compendium.wh40k-rpg.dh2-core-stats-skills.yyy"
 */
export function findSkillUuid(skillName: string | null | undefined, specialization: string | null = null): string | null | undefined {
    if (skillName === null || skillName === undefined || skillName === '') return null;

    // Check if specialization is embedded in the name
    // Pattern: "Skill Name (Specialization)"
    let resolvedSkillName: string = skillName;
    let resolvedSpecialization: string | null = specialization;
    if ((resolvedSpecialization === null || resolvedSpecialization === '') && resolvedSkillName.includes('(') && resolvedSkillName.includes(')')) {
        const match = resolvedSkillName.match(/^(.+?)\s*\((.+?)\)\s*$/);
        if (match) {
            resolvedSkillName = match[1].trim();
            resolvedSpecialization = match[2].trim();
        }
    }

    // Build cache key
    const cacheKey = resolvedSpecialization !== null && resolvedSpecialization !== '' ? `${resolvedSkillName}::${resolvedSpecialization}` : resolvedSkillName;

    // Check cache first
    if (_skillUuidCache.has(cacheKey)) {
        return _skillUuidCache.get(cacheKey);
    }

    try {
        // Find the skills compendium pack
        const skillPack = game.packs.find((p) => p.metadata.name === 'dh2-core-stats-skills' && p.documentName === 'Item');

        if (!skillPack) {
            console.warn("Skill compendium pack 'dh2-core-stats-skills' not found");
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

/**
 * Batch lookup multiple skills at once
 * More efficient than calling findSkillUuid individually
 *
 * @param {Array<{name: string, specialization?: string}>} skills - Array of skill objects
 * @returns {Map<string, string|null>} - Map of cache keys to UUIDs
 *
 * @example
 * const skills = [
 *   { name: "Awareness" },
 *   { name: "Common Lore", specialization: "Imperium" },
 *   { name: "Tech-Use" }
 * ];
 * const results = await batchFindSkillUuids(skills);
 * // Returns: Map { "Awareness" => "Compendium...", "Common Lore::Imperium" => "Compendium...", ... }
 */
export function batchFindSkillUuids(skills: Array<{ name: string; specialization?: string }>): Map<string, string | null | undefined> {
    const results = new Map<string, string | null | undefined>();

    for (const skill of skills) {
        const uuid = findSkillUuid(skill.name, skill.specialization ?? null);
        const cacheKey = skill.specialization !== undefined && skill.specialization !== '' ? `${skill.name}::${skill.specialization}` : skill.name;
        results.set(cacheKey, uuid);
    }

    return results;
}

/**
 * Get a skill item from UUID
 *
 * @param {string} uuid - Compendium UUID
 * @returns {Promise<Item|null>} - The skill Item or null
 */
type SkillItemLike = { type: string };

export async function getSkillFromUuid(uuid: string): Promise<SkillItemLike | null> {
    if (uuid === '') return null;

    try {
        const item = (await fromUuid(uuid)) as SkillItemLike | null;
        if (item !== null && item.type === 'skill') {
            return item;
        }
        return null;
    } catch (error) {
        console.error('Error loading skill from UUID:', error);
        return null;
    }
}

/**
 * Parse a skill name into base name and specialization
 *
 * @param {string} fullName - Full skill name (e.g., "Common Lore (Imperium)")
 * @returns {{name: string, specialization: string|null}}
 *
 * @example
 * parseSkillName("Common Lore (Imperium)")
 * // Returns: { name: "Common Lore", specialization: "Imperium" }
 *
 * parseSkillName("Awareness")
 * // Returns: { name: "Awareness", specialization: null }
 */
export function parseSkillName(fullName: string): { name: string; specialization: string | null } {
    if (fullName === '') return { name: '', specialization: null };

    const match = fullName.match(/^(.+?)\s*\((.+?)\)\s*$/);
    if (match) {
        return {
            name: match[1].trim(),
            specialization: match[2].trim(),
        };
    }

    return {
        name: fullName.trim(),
        specialization: null,
    };
}
