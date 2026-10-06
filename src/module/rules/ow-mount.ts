/**
 * Only War · Mounted Combat P2 engine (#159 — Hammer of the Emperor
 * supplement §"MOUNTED COMBAT" / "MOUNT SPECIAL ACTIONS" / "MOUNT TRAITS",
 * hammer.md lines 4046-4260).
 *
 * Pure rules / math layer. Per Direction #7 the per-mount profile
 * (characteristics, full trait list, breed-specific advances) lives in
 * compendium documents; this module bakes in only the four RAW *mounted
 * special actions* the action resolver dispatches, since those are engine
 * primitives rather than content.
 *
 * The engine is RNG-free and actor-decoupled; effect text and display
 * strings come from i18n at the UI layer.
 */

/* -------------------------------------------------------------------- */
/*  Mount traits                                                        */
/* -------------------------------------------------------------------- */

/**
 * The mount traits Hammer of the Emperor prints (p137). A rider's cached
 * mount link records these ids so the sheet can badge them; none of them
 * modifies the rider's Weapon Skill, so no trait feeds an attack modifier.
 */
export type MountTraitId = 'bred-for-war' | 'enduring' | 'irritable' | 'loyal' | 'paralytic-venom' | 'placid' | 'skittish' | 'terrain-master' | 'wiry';

/* -------------------------------------------------------------------- */
/*  Mounted special actions                                             */
/* -------------------------------------------------------------------- */

/** Identifier for one of the four RAW mounted special actions. */
export type MountedActionId = 'charge' | 'trample' | 'run-down' | 'mounted-attack';

/** Action-economy timing of a mounted special action. */
export type MountedActionTiming = 'full' | 'half' | 'reaction';

/**
 * One mounted action definition. `description` is an opaque i18n key /
 * pre-resolved string — the engine never parses it.
 */
export interface MountedAction {
    readonly id: MountedActionId;
    readonly timing: MountedActionTiming;
    readonly description: string;
}

/**
 * RAW catalogue of mounted special actions (Hammer of the Emperor
 * §"MOUNT SPECIAL ACTIONS"). Charge, Trample, and Run Down are full
 * actions; Mounted Attack (the rider striking from the saddle) is a
 * half action so the rider can pair it with a movement or reaction.
 */
export const MOUNTED_ACTIONS: ReadonlyArray<MountedAction> = Object.freeze([
    Object.freeze({
        id: 'charge',
        timing: 'full',
        description: 'WH40K.OW.Mount.Action.Charge',
    }),
    Object.freeze({
        id: 'trample',
        timing: 'full',
        description: 'WH40K.OW.Mount.Action.Trample',
    }),
    Object.freeze({
        id: 'run-down',
        timing: 'full',
        description: 'WH40K.OW.Mount.Action.RunDown',
    }),
    Object.freeze({
        id: 'mounted-attack',
        timing: 'half',
        description: 'WH40K.OW.Mount.Action.MountedAttack',
    }),
]);

/**
 * Look up a mounted action by id. Throws when the id is not in the
 * catalogue — callers are expected to use the `MountedActionId` union
 * type, so an unknown id is a programming error rather than a content
 * problem.
 */
export function getMountedAction(id: MountedActionId): MountedAction {
    const found = MOUNTED_ACTIONS.find((a) => a.id === id);
    if (found === undefined) {
        throw new Error(`Unknown mounted action: ${id}`);
    }
    return found;
}
