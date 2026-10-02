/**
 * Deciding when an NPC's armour has been AUTHORED rather than derived.
 *
 * An NPC with `armour.authored === false` has its armour re-derived from
 * Toughness + worn items on every prepare (`NPCData#_prepareArmour`). That
 * derivation must not swallow a value the GM deliberately enters — but a sheet
 * save also echoes the derived numbers it displays (they live only in memory,
 * so they differ from the stored zeros). These helpers tell the two apart:
 * a change that moves a value away from what is shown is an authoring edit and
 * flips `authored` on; a change that merely repeats the shown value is an echo
 * and is dropped, so derived armour is never frozen into the stored record.
 */

/**
 * The NPC armour block as prepared (what the sheet shows). Declared here — a
 * dependency-free leaf — and reused by `NPCData#armour`, so the data model and
 * this module share one shape without an import cycle.
 */
export interface NpcArmour {
    mode: 'simple' | 'locations';
    total: number;
    authored: boolean;
    locations: {
        head: number;
        body: number;
        leftArm: number;
        rightArm: number;
        leftLeg: number;
        rightLeg: number;
        [key: string]: number;
    };
}

/** An incoming partial armour change, as it arrives in an update. */
export interface NpcArmourPatch {
    mode?: NpcArmour['mode'];
    total?: number;
    authored?: boolean;
    locations?: Partial<Record<string, number>>;
}

/** Does `patch` move any armour value away from the one currently shown? */
function changesShownArmour(patch: NpcArmourPatch, shown: NpcArmour): boolean {
    if (patch.mode !== undefined && patch.mode !== shown.mode) return true;
    if (patch.total !== undefined && patch.total !== shown.total) return true;
    const locations = patch.locations ?? {};
    return Object.entries(locations).some(([key, value]) => value !== undefined && value !== shown.locations[key]);
}

/**
 * Resolve an incoming armour update against the armour currently shown.
 *
 * Returns the patch to commit, or `null` when there is nothing to commit:
 * - already authored, or `authored` set explicitly → the patch as given;
 * - a value differs from what is shown → the patch with `authored: true`;
 * - otherwise it is a pure echo of the derived values → `null`, so the derived
 *   numbers are never written into the stored record.
 * @param {NpcArmourPatch} patch  The incoming armour change.
 * @param {NpcArmour} shown  The armour as currently prepared.
 * @returns {NpcArmourPatch | null}
 */
export function resolveArmourEdit(patch: NpcArmourPatch, shown: NpcArmour): NpcArmourPatch | null {
    if (shown.authored || patch.authored !== undefined) return patch;
    return changesShownArmour(patch, shown) ? { ...patch, authored: true } : null;
}

/**
 * Whether armour supplied at creation is an authored value: a non-zero total or
 * location AP. All-zero (or absent) armour is left to the derivation.
 * @param {NpcArmourPatch | undefined} armour  The armour block of the create data.
 * @returns {boolean}
 */
export function isAuthoredOnCreate(armour: NpcArmourPatch | undefined): boolean {
    if (armour === undefined || armour.authored !== undefined) return false;
    if ((armour.total ?? 0) > 0) return true;
    return Object.values(armour.locations ?? {}).some((value) => (value ?? 0) > 0);
}
