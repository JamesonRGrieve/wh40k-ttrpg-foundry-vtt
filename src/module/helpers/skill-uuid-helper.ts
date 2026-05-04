/**
 * Skill UUID Helper
 *
 * Utility for looking up skill UUIDs from compendium packs.
 * Handles standard skills and specialist skills with specializations.
 *
 * @src/module/data/grant/_module.ts helpers/skill-uuid-helper
 */

/**
 * Cache for skill UUID lookups to avoid repeated compendium searches
 * @scripts/gen-i18n-types.mjs {Map<string, string|null>}
 */
const _skillUuidCache = new Map<string, string | null>();

/**
 * Clear the skill UUID cache
 * Useful when compendium packs are reloaded or modified
 */
export function clearSkillUuidCache() {
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
export function findSkillUuid(skillName: string, specialization: string | null = null): Promise<string | null> {
    if (!skillName) return Promise.resolve(null);

    // Check if specialization is embedded in the name
    // Pattern: "Skill Name (Specialization)"
    let resolvedSkillName = skillName;
    let resolvedSpecialization: string | null = specialization;
    if (!resolvedSpecialization && resolvedSkillName.includes('(') && resolvedSkillName.includes(')')) {
        const match = resolvedSkillName.match(/^(.+?)\s*\((.+?)\)\s*$/);
        if (match) {
            resolvedSkillName = match[1].trim();
            resolvedSpecialization = match[2].trim();
        }
    }

    // Build cache key
    const cacheKey = resolvedSpecialization ? `${resolvedSkillName}::${resolvedSpecialization}` : resolvedSkillName;

    // Check cache first
    if (_skillUuidCache.has(cacheKey)) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return Promise.resolve(_skillUuidCache.get(cacheKey)!);
    }

    try {
        // Find the skills compendium pack
        // Assuming `game.packs` is globally available in the Foundry VTT environment.
        const skillPack = game.packs.find((p) => p.metadata.name === 'dh2-core-stats-skills' && p.documentName === 'Item');

        if (!skillPack) {
            console.warn("Skill compendium pack 'dh2-core-stats-skills' not found");
            _skillUuidCache.set(cacheKey, null);
            return Promise.resolve(null);
        }

        // Get pack index (lightweight metadata)
        const index = skillPack.index;

        // Build search variants
        const searchVariants: string[] = [];
        if (resolvedSpecialization) {
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
            for (const entry of index) { // Assuming index is an array-like iterable
                if (entry.name === variant) {
                    const uuid = `Compendium.${skillPack.metadata.id}.${entry.id}`;
                    _skillUuidCache.set(cacheKey, uuid);
                    return Promise.resolve(uuid);
                }
            }
        }

        // Try case-insensitive partial matches
        const skillNameLower = resolvedSkillName.toLowerCase();
        // Explicitly type and assign specializationLower to handle potential undefined/null
        let specializationLower: string | undefined;
        if (typeof resolvedSpecialization === 'string') {
            specializationLower = resolvedSpecialization.toLowerCase();
        }

        for (const entry of index) {
            // Fix for TS18048: 'entry.name' is possibly 'undefined'.
            // Using nullish coalescing operator to default to an empty string if entry.name is null/undefined.
            const entryNameLower = (entry.name ?? '').toLowerCase();

            // Check if entry name contains the skill name
            if (!entryNameLower.includes(skillNameLower)) continue;

            // If we have a specialization, check for that too
            // Fix for TS2339: Property 'toLowerCase' does not exist on type 'never'.
            // 'specializationLower' is now typed as string | undefined, resolving the 'never' type issue.
            if (specializationLower && !entryNameLower.includes(specializationLower)) {
                continue;
            }

            // Found a match
            const uuid = `Compendium.${skillPack.metadata.id}.${entry.id}`;
            _skillUuidCache.set(cacheKey, uuid);
            return Promise.resolve(uuid);
        }

        // No match found
        console.debug(`Skill not found in compendium: ${cacheKey}`);
        _skillUuidCache.set(cacheKey, null);
        return Promise.resolve(null);
    } catch (error) {
        console.error('Error looking up skill UUID:', error);
        _skillUuidCache.set(cacheKey, null);
        return Promise.resolve(null);
    }
}

/**
 * Batch lookup multiple skills at once
 * More efficient than calling findSkillUuid individually
 *
 * @param {Array<{name: string, specialization?: string}>} skills - Array of skill objects
 * @returns {Promise<Map<string, string|null>>} - Map of cache keys to UUIDs
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
export async function batchFindSkillUuids(skills: Array<{ name: string; specialization?: string }>): Promise<Map<string, string | null>> {
    const results = new Map<string, string | null>();

    // Process all skills in parallel
    const promises = skills.map(async (skill: { name: string; specialization?: string }) => {
        const uuid = await findSkillUuid(skill.name, skill.specialization);
        const cacheKey = skill.specialization ? `${skill.name}::${skill.specialization}` : skill.name;
        results.set(cacheKey, uuid);
    });

    await Promise.all(promises);
    return results;
}

/**
 * Get a skill item from UUID
 *
 * @param {string} uuid - Compendium UUID
 * @returns {Promise<Item|null>} - The skill Item or null
 */
export async function getSkillFromUuid(uuid: string): Promise<Item | null> {
    if (!uuid) return null;

    try {
        // Assuming `fromUuid` is a global Foundry VTT function.
        // `fromUuid` returns `Promise<ClientDocument | null>`.
        // Casting to `Item` based on the expected return type and context.
        const item = await fromUuid(uuid);
        // Fix for TS2339: Property 'type' does not exist on type 'InvalidUuid | ImplementationFor<ALL_DOCUMENT_TYPES>'.
        // Cast `item` to `Item` to satisfy the type checker and Foundry's API for accessing `.type`.
        if (item && (item as Item).type === 'skill') {
            return item as Item; // Return as Item
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
    if (!fullName) return { name: '', specialization: null };

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
