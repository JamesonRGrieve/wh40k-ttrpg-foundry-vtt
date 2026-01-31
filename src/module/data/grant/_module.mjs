/**
 * Grant DataModels for the Rogue Trader system.
 * 
 * Grants represent things that can be given to an actor from items.
 * Following DND5E's Advancement pattern with apply/reverse/restore.
 */

import BaseGrantData from "./base-grant.mjs";
import ItemGrantData from "./item-grant.mjs";
import SkillGrantData from "./skill-grant.mjs";
import CharacteristicGrantData from "./characteristic-grant.mjs";
import ResourceGrantData from "./resource-grant.mjs";
import ChoiceGrantData from "./choice-grant.mjs";

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
  choice: ChoiceGrantData
};

/**
 * Create a grant instance from configuration data.
 * @param {object} config - Grant configuration with type field
 * @returns {BaseGrantData|null}
 */
export function createGrant(config) {
  if (!config?.type) {
    console.warn("createGrant: Missing type in config", config);
    return null;
  }
  
  const GrantClass = GRANT_TYPES[config.type];
  if (!GrantClass) {
    console.warn(`createGrant: Unknown grant type "${config.type}"`);
    return null;
  }
  
  try {
    return new GrantClass(config);
  } catch (error) {
    console.warn(`createGrant: Failed to create ${config.type} grant:`, error.message, config);
    return null;
  }
}

/**
 * Validate a grant configuration.
 * @param {object} config - Grant configuration
 * @returns {string[]} Array of validation errors
 */
export function validateGrantConfig(config) {
  const grant = createGrant(config);
  if (!grant) return [`Invalid grant type: ${config?.type}`];
  return grant.validateGrant();
}
