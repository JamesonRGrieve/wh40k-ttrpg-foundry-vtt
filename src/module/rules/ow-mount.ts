/**
 * Only War · Mounted Combat P2 engine (#159 — Hammer of the Emperor
 * supplement §"MOUNTED COMBAT" / "MOUNT SPECIAL ACTIONS" / "MOUNT TRAITS",
 * hammer.md lines 4046-4260).
 *
 * Pure rules / math layer. Per Direction #7 the per-mount profile
 * (characteristics, full trait list, breed-specific advances) lives in
 * compendium documents; this module bakes in only the four RAW *mounted
 * special actions* and the small set of mechanically-impactful mount
 * traits that the action resolver needs to consult, since those are
 * engine primitives rather than content.
 *
 * The engine is RNG-free and actor-decoupled; effect text and display
 * strings come from i18n at the UI layer.
 */

/* -------------------------------------------------------------------- */
/*  Mount traits                                                        */
/* -------------------------------------------------------------------- */

/**
 * Mechanically-impactful mount traits enumerated here. Cosmetic / pure
 * fluff traits (e.g. breed-flavour entries) live in the compendium and
 * never reach this engine.
 */
export type MountTraitId = 'quadruped' | 'sure-footed' | 'steadfast' | 'unnatural-speed' | 'fearless' | 'brutal-charge';

/**
 * A single mount-trait definition. `modifier` is the headline numeric
 * delta the trait contributes when its preconditions are met; the
 * combination logic (which traits apply when) lives in
 * `applyMountedAttackModifier` rather than on the trait itself, because
 * a trait may stack only in certain situations (e.g. Brutal Charge
 * triggers only on a Charge action).
 */
export interface MountTrait {
    readonly id: MountTraitId;
    readonly description: string;
    readonly modifier?: number;
}

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

/* -------------------------------------------------------------------- */
/*  Mounted attack modifier                                             */
/* -------------------------------------------------------------------- */

/**
 * Inputs to `applyMountedAttackModifier`. `roughTerrain` is optional
 * because most encounters are not flagged as rough terrain; when
 * omitted Sure-Footed contributes nothing.
 */
export interface MountedAttackContext {
    readonly riderWeaponSkill: number;
    readonly mountTraits: ReadonlyArray<MountTraitId>;
    readonly charging: boolean;
    readonly roughTerrain?: boolean;
}

/** Result of `applyMountedAttackModifier`. */
export interface MountedAttackModifierResult {
    readonly modifier: number;
    readonly reasons: string[];
}

/**
 * Combine the mounted-attack situational modifiers into a single delta
 * plus a list of i18n keys explaining the components.
 *
 * Stacking rules (Hammer of the Emperor §"MOUNT TRAITS"):
 *   - Brutal Charge: +20 WS on the turn the mount is charging.
 *   - Steadfast: +10 WS on every mounted attack.
 *   - Sure-Footed: +10 WS when the engagement is on rough terrain.
 *
 * All applicable bonuses sum; the engine never caps the total, since
 * the RAW does not cap it either. `riderWeaponSkill` is plumbed through
 * to keep the call shape compatible with future per-WS rules (e.g. a
 * cap relative to the rider's base WS) without changing the signature.
 */
export function applyMountedAttackModifier(ctx: MountedAttackContext): MountedAttackModifierResult {
    // `riderWeaponSkill` is part of the public context shape but
    // currently informational; reference it so the param is not flagged
    // as unused while preserving the signature for future RAW additions.
    void ctx.riderWeaponSkill;

    const reasons: string[] = [];
    let modifier = 0;

    const hasTrait = (id: MountTraitId): boolean => ctx.mountTraits.includes(id);

    if (ctx.charging && hasTrait('brutal-charge')) {
        modifier += 20;
        reasons.push('WH40K.OW.Mount.Modifier.BrutalCharge');
    }

    if (hasTrait('steadfast')) {
        modifier += 10;
        reasons.push('WH40K.OW.Mount.Modifier.Steadfast');
    }

    if (ctx.roughTerrain === true && hasTrait('sure-footed')) {
        modifier += 10;
        reasons.push('WH40K.OW.Mount.Modifier.SureFooted');
    }

    return { modifier, reasons };
}
