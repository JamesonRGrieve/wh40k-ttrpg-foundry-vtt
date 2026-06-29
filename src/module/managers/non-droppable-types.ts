/**
 * Item types that represent ownership facts rather than physical objects and
 * therefore can never be dropped on the ground (and are excluded from Item
 * Piles pile contents). Content-agnostic: these are system mechanics — actor/
 * item *type* identifiers — not compendium content (Direction #7).
 *
 * Lives in its own module so both the loot drop manager and the Item Piles
 * integration can share it without a circular import (the manager already
 * depends on the integration).
 */
export const NON_DROPPABLE_TYPES: ReadonlySet<string> = new Set([
    'skill',
    'talent',
    'trait',
    'aptitude',
    'condition',
    'criticalInjury',
    'mutation',
    'malignancy',
    'mentalDisorder',
    'originPath',
    'peer',
    'enemy',
    'specialAbility',
    'psychicPower',
    'navigatorPower',
    'ritual',
    'order',
]);
