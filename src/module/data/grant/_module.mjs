/**
 * Grant DataModels for the Rogue Trader system.
 * 
 * Grants represent things that can be given to an actor from items.
 * Following DND5E's Advancement pattern with apply/reverse/restore.
 */

export { default as BaseGrantData } from "./base-grant.mjs";
export { default as ItemGrantData } from "./item-grant.mjs";
export { default as SkillGrantData } from "./skill-grant.mjs";
export { default as CharacteristicGrantData } from "./characteristic-grant.mjs";
export { default as ResourceGrantData } from "./resource-grant.mjs";
export { default as ChoiceGrantData } from "./choice-grant.mjs";

/**
 * Registry of all grant types.
 * @type {Object<string, typeof BaseGrantData>}
 */
export const GRANT_TYPES = {
  item: (await import("./item-grant.mjs")).default,
  skill: (await import("./skill-grant.mjs")).default,
  characteristic: (await import("./characteristic-grant.mjs")).default,
  resource: (await import("./resource-grant.mjs")).default,
  choice: (await import("./choice-grant.mjs")).default
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
  
  return new GrantClass(config);
}

/**
 * Validate a grant configuration.
 * @param {object} config - Grant configuration
 * @returns {string[]} Array of validation errors
 */
export function validateGrantConfig(config) {
  const grant = createGrant(config);
  if (!grant) return [`Invalid grant type: ${config?.type}`];
  return grant.validate();
}
