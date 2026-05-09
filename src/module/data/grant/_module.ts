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
 * @type {Object<string, typeof BaseGrantData>}
 */
export const GRANT_TYPES = {
    item: ItemGrantData,
    skill: SkillGrantData,
    characteristic: CharacteristicGrantData,
    resource: ResourceGrantData,
    choice: ChoiceGrantData,
};

/** Grant configuration object with a discriminating `type` field. */
// eslint-disable-next-line no-restricted-syntax -- boundary: external grant config from item flags
export type GrantConfig = { type?: string } & Record<string, unknown>;

/**
 * Create a grant instance from configuration data.
 * @param config - Grant configuration with type field
 */
export function createGrant(config: GrantConfig): BaseGrantData | null {
    const type = config.type;
    if (typeof type !== 'string' || type === '') {
        console.warn('createGrant: Missing type in config', config);
        return null;
    }

    if (!(type in GRANT_TYPES)) {
        console.warn(`createGrant: Unknown grant type "${type}"`);
        return null;
    }
    const GrantClass = GRANT_TYPES[type as keyof typeof GRANT_TYPES];

    try {
        return new GrantClass(config);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`createGrant: Failed to create ${type} grant:`, message, config);
        return null;
    }
}

/**
 * Validate a grant configuration.
 * @param config - Grant configuration
 * @returns Array of validation errors
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: external grant config from item flags
export function validateGrantConfig(config: GrantConfig): string[] {
    const grant = createGrant(config);
    if (!grant) {
        const type = config.type;
        return [`Invalid grant type: ${typeof type === 'string' ? type : '(none)'}`];
    }
    return grant.validateGrant();
}
