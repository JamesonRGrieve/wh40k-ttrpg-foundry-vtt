/**
 * Grant DataModels for the WH40K RPG system.
 *
 * Grants represent things that can be given to an actor from items.
 * Following DND5E's Advancement pattern with apply/reverse/restore.
 */

import BaseGrantData from './base-grant.ts';
import CharacteristicGrantData from './characteristic-grant.ts';
import ChoiceGrantData from './choice-grant.ts';
import ItemGrantData from './item-grant.ts';
import ResourceGrantData from './resource-grant.ts';
import SkillGrantData from './skill-grant.ts';

export { BaseGrantData, ItemGrantData, SkillGrantData, CharacteristicGrantData, ResourceGrantData, ChoiceGrantData };

/**
 * Registry of all grant types.
 * @scripts/gen-i18n-types.mjs {Object<string, typeof BaseGrantData>}
 */
export const GRANT_TYPES = {
    item: ItemGrantData,
    skill: SkillGrantData,
    characteristic: CharacteristicGrantData,
    resource: ResourceGrantData,
    choice: ChoiceGrantData,
};

/**
 * Create a grant instance from configuration data.
 * @param {object} config - Grant configuration with type field
 * @returns {BaseGrantData|null}
 */
export function createGrant(config: Record<string, unknown>) {
    if (!config?.type) {
        console.warn('createGrant: Missing type in config', config);
        return null;
    }

    const GrantClass = GRANT_TYPES[config.type as keyof typeof GRANT_TYPES];
    if (!GrantClass) {
        console.warn(`createGrant: Unknown grant type "${config.type}"`);
        return null;
    }

    try {
        return new GrantClass(config);
    } catch (error) {
        console.warn(`createGrant: Failed to create ${config.type} grant:`, (error as Error).message, config);
        return null;
    }
}

/**
 * Validate a grant configuration.
 * @param {object} config - Grant configuration
 * @returns {string[]} Array of validation errors
 */
export function validateGrantConfig(config: Record<string, unknown>) {
    const grant = createGrant(config);
    if (!grant) return [`Invalid grant type: ${config?.type}`];
    return grant.validateGrant();
}
