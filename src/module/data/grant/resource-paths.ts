/**
 * @file Where each grantable resource lives on an actor, and how an applied
 * resource grant is reversed (#91 follow-up).
 *
 * The single resource→path map, shared by `ResourceGrantData` (apply / reverse /
 * restore) and `GrantsManager._reverseResourceGrant`. Paths follow the actor
 * schemas:
 * - wounds: `woundsField()` — `{ max, value, critical }` on every creature
 *   (`templates/creature.ts`) and every NPC (`npc.ts`).
 * - fate: `{ max, value }` on creatures and NPCs; `max` is the Fate total (threshold).
 * - corruption / insanity: plain `NumberField`s on `character.ts` (no `.value`);
 *   NPCs carry neither.
 *
 * Pure: no Foundry globals. The caller reads current values through `read`.
 */

/** The resources a resource grant can change. */
export const GRANT_RESOURCES = ['wounds', 'fate', 'corruption', 'insanity'] as const;

export type GrantResource = (typeof GRANT_RESOURCES)[number];

/** One resource's actor paths and label. */
export interface ResourcePaths {
    /** Langpack key of the resource's name. */
    label: string;
    /** The resource's current value. */
    valuePath: string;
    /** Its maximum, moved with the value; `null` for a resource with no maximum. */
    maxPath: string | null;
}

export const RESOURCE_PATHS: Readonly<Record<GrantResource, ResourcePaths>> = {
    wounds: { label: 'WH40K.Resource.Wounds', valuePath: 'system.wounds.value', maxPath: 'system.wounds.max' },
    fate: { label: 'WH40K.Resource.Fate', valuePath: 'system.fate.value', maxPath: 'system.fate.max' },
    corruption: { label: 'WH40K.Resource.Corruption', valuePath: 'system.corruption', maxPath: null },
    insanity: { label: 'WH40K.Resource.Insanity', valuePath: 'system.insanity', maxPath: null },
};

/** Whether `type` names a grantable resource. */
export function isGrantResource(type: string): type is GrantResource {
    return (GRANT_RESOURCES as readonly string[]).includes(type);
}

/** What a resource grant recorded when it was applied. */
export interface ResourceAppliedState {
    formula: string;
    rolledValue: number;
    additive: boolean;
    previousValue: number;
    previousMax: number | null;
    newValue: number;
    newMax: number | null;
}

/**
 * Guard for a stored applied-state entry (the manager reads it back out of
 * actor flags, where it is untyped).
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: type guard over an applied-state entry read back from untyped actor flags
export function isResourceAppliedState(value: unknown): value is ResourceAppliedState {
    if (value === null || typeof value !== 'object') return false;
    return (
        'rolledValue' in value &&
        typeof value.rolledValue === 'number' &&
        'additive' in value &&
        typeof value.additive === 'boolean' &&
        'previousValue' in value &&
        typeof value.previousValue === 'number'
    );
}

/** The update one resource grant makes, and the state it records for reversal. */
export interface ResourceApplication {
    updates: Record<string, number>;
    state: ResourceAppliedState;
}

/**
 * Apply `value` of a resource. An additive grant adds it to the current value
 * (and maximum); a replacing grant sets both to it, so re-applying an origin
 * does not stack.
 * @param type  The resource.
 * @param grant  The grant's formula, rolled value and mode.
 * @param read  Reads a current numeric value at an actor path.
 */
export function resourceApplyUpdates(
    type: GrantResource,
    grant: { formula: string; value: number; additive: boolean },
    read: (path: string) => number,
): ResourceApplication {
    const { valuePath, maxPath } = RESOURCE_PATHS[type];
    const { formula, value, additive } = grant;
    const previousValue = read(valuePath);
    const previousMax = maxPath === null ? null : read(maxPath);
    const newValue = additive ? previousValue + value : value;
    const newMax = previousMax === null ? null : additive ? previousMax + value : value;
    const updates: Record<string, number> = { [valuePath]: newValue };
    if (maxPath !== null && newMax !== null) updates[maxPath] = newMax;
    return { updates, state: { formula, rolledValue: value, additive, previousValue, previousMax, newValue, newMax } };
}

/** The update that re-applies a reversed resource grant: its rolled value is added back. */
export function resourceRestoreUpdates(type: GrantResource, state: ResourceAppliedState, read: (path: string) => number): Record<string, number> {
    const { valuePath, maxPath } = RESOURCE_PATHS[type];
    const updates: Record<string, number> = { [valuePath]: read(valuePath) + state.rolledValue };
    if (maxPath !== null) updates[maxPath] = read(maxPath) + state.rolledValue;
    return updates;
}

/**
 * The `actor.update()` paths and values that reverse one applied resource.
 * A replacing grant restores the captured value / max exactly; an additive
 * grant subtracts what it added from the CURRENT value / max, so changes made
 * since the grant are kept.
 * @param type  The resource.
 * @param state  What the grant recorded when applied.
 * @param read  Reads a current numeric value at an actor path.
 */
export function resourceReverseUpdates(type: GrantResource, state: ResourceAppliedState, read: (path: string) => number): Record<string, number> {
    const { valuePath, maxPath } = RESOURCE_PATHS[type];
    const updates: Record<string, number> = {};
    if (!state.additive) {
        updates[valuePath] = state.previousValue;
        if (maxPath !== null && state.previousMax !== null) updates[maxPath] = state.previousMax;
        return updates;
    }
    updates[valuePath] = read(valuePath) - state.rolledValue;
    if (maxPath !== null) updates[maxPath] = read(maxPath) - state.rolledValue;
    return updates;
}
