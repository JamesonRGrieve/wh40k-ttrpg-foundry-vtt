/**
 * System constants
 */
export const SYSTEM_ID = 'wh40k-rpg';

/**
 * The status id for "this creature is dead" — Foundry core's own `dead`, which
 * `CONFIG.specialStatusEffects.DEFEATED` maps to, so the token defeated overlay
 * and the combat-tracker defeated marker follow the same state the rules engine
 * reads from `actor.statuses` (#495).
 *
 * Lives here rather than in the condition registry so a consumer (e.g. the
 * death → item-pile conversion) can key off it without importing
 * `rules/active-effects.ts`, whose module-scope condition table touches the
 * Foundry `CONST` global and therefore cannot be loaded outside a booted client.
 */
export const DEAD_STATUS_ID = 'dead';

/**
 * The status id (condition `system.identifier`) the fatigue model applies when
 * fatigue exceeds its threshold. An identifier in the condition vocabulary, not
 * content: the condition's name, art and modifiers come from its compendium
 * document.
 */
export const UNCONSCIOUS_STATUS_ID = 'unconscious';
