/**
 * Deathwatch Mission Oaths RAW resolver (#168 — core.md Table 7-16
 * §"OATHS" p.10165).
 *
 * Pure functions over a kill-team leader's sworn-Oath state. The caller
 * (character DataModel, sheet action handler, chat card) owns I/O, the
 * compendium-resolved Oath definition, and persistence of `activeOathId`
 * on the leader's actor; this module owns the gating (leader-only,
 * exactly-one-at-a-time) and the projection of an Oath definition into
 * its mission-duration buff plus the set of Squad-Mode abilities it
 * unlocks.
 *
 * Canonical rules referenced here:
 *   - Only a kill-team leader may swear an Oath. Other Battle-Brothers
 *     are bound by the Oath their leader has sworn — they do not swear
 *     their own.
 *   - An Oath, once sworn, persists for the duration of the mission. A
 *     leader may swear at most one Oath per mission; the table is not a
 *     menu of stacking effects.
 *   - Each Oath grants TWO things in parallel:
 *       1. A mission-duration buff (a characteristic bonus, a trait, a
 *          wound bonus, a re-roll, etc.) that applies to the whole
 *          kill-team while in support range of the leader.
 *       2. A set of Squad-Mode abilities, unlocked for the duration of
 *          the mission, that the kill-team may activate while in Squad
 *          Mode (Cohesion cost / sustained handling lives in #163).
 *   - "Releasing" an Oath outside of mission completion is a GM-fiat
 *     escape hatch (e.g. catastrophic failure, oath broken, leader
 *     killed). RAW does not model it as a player-driven action; this
 *     module exposes {@link releaseOath} for the bookkeeping path.
 *
 * Out of scope this round (compendium content, sheet wiring, chat
 * partials): the actual catalogue of Oaths (Oath of Knowledge, Oath of
 * Glory, etc.), their specific buffs / ability lists, the leader-role
 * marker on the character DataModel, and the Cohesion-pool plumbing
 * that fires when an unlocked Squad-Mode ability activates (#163
 * `activateSquadAbility` already covers that surface).
 */

/**
 * A content-agnostic shape describing the mission-duration effect of an
 * Oath. Concrete buffs (which characteristic, how many wounds, which
 * trait) come from the compendium document for the Oath (Direction #7);
 * this interface exists so the engine can pass a buff through to a chat
 * card or Active Effect without interpreting it.
 *
 * Every field except `id` is optional because Oaths in RAW vary widely
 * in shape — some grant a flat characteristic bonus, some grant a trait,
 * some grant a special ability with no characteristic at all.
 */
export interface OathBuff {
    /** Compendium-resolved identifier for the buff (e.g. the buff item's UUID). */
    id: string;
    /** Characteristic key (e.g. `weaponSkill`, `willpower`) the buff modifies, if any. */
    characteristic?: string;
    /** Integer modifier applied to {@link characteristic} (positive or negative). */
    modifier?: number;
    /** Trait key (e.g. `fearless`, `unstoppable`) the buff grants, if any. */
    trait?: string;
    /** Human-readable description; localisation is the caller's job. */
    description?: string;
}

/**
 * A content-agnostic shape describing an Oath as it lives in the
 * compendium. The engine only reads the leader prerequisite, the buff
 * payload, and the unlocked Squad-Mode ability list; everything else
 * (lore text, icon, sort order) is the sheet's concern.
 *
 * `leaderPrereq` is intentionally a literal-`true` rather than a boolean
 * so a non-leader Oath cannot be expressed at the type level — RAW does
 * not have any.
 */
export interface OathDef {
    /** Compendium-resolved identifier for the Oath itself. */
    id: string;
    /** RAW: only kill-team leaders may swear an Oath. Always `true`. */
    leaderPrereq: true;
    /** The mission-duration buff this Oath confers. */
    buff: OathBuff;
    /** Squad-Mode ability identifiers unlocked while this Oath is active. */
    grantedSquadAbilities: string[];
}

/* -------------------------------------------- */
/*  Gating                                      */
/* -------------------------------------------- */

/** Why a {@link canSwearOath} call returned `allowed: false`. */
export type CanSwearOathFailureReason = 'not-leader' | 'already-sworn' | 'none';

/** Input shape for {@link canSwearOath}. */
export interface CanSwearOathArgs {
    /** Whether the swearer is the kill-team's leader. */
    isLeader: boolean;
    /**
     * The id of the Oath currently sworn by this leader, or `null` if
     * none. RAW: one Oath per mission, so a non-null value blocks new
     * swearing until {@link releaseOath} is called.
     */
    currentOathId: string | null;
    /** The Oath the caller is proposing to swear. */
    oath: OathDef;
}

/** Result shape for {@link canSwearOath}. */
export interface CanSwearOathResult {
    /** Whether the Oath may be sworn. */
    allowed: boolean;
    /** Diagnostic / chat-card reason code when swearing is blocked. */
    reason?: CanSwearOathFailureReason;
}

/**
 * Resolve whether a Battle-Brother may swear the proposed Oath.
 *
 * RAW gates: the swearer must be the kill-team leader, AND no other
 * Oath may already be sworn for this mission. The proposed Oath's
 * `leaderPrereq` is structurally `true` so the type system enforces the
 * "leader-only" property at the call site; this function still surfaces
 * it as a runtime check (`reason: 'none'`) for defence in depth in case
 * a malformed compendium document slipped through validation.
 */
export function canSwearOath(args: CanSwearOathArgs): CanSwearOathResult {
    if (!args.isLeader) {
        return { allowed: false, reason: 'not-leader' };
    }
    if (args.currentOathId !== null) {
        return { allowed: false, reason: 'already-sworn' };
    }
    return { allowed: true };
}

/* -------------------------------------------- */
/*  Swearing & releasing                        */
/* -------------------------------------------- */

/** Input shape for {@link swearOath}. */
export interface SwearOathArgs {
    /** The Oath being sworn. */
    oath: OathDef;
}

/** Result shape for {@link swearOath}. */
export interface SwearOathResult {
    /** The id of the now-active Oath; persist this on the leader's actor. */
    activeOathId: string;
    /** The mission-duration buff to apply (chat card / Active Effect). */
    missionBuff: OathBuff;
    /** Squad-Mode ability identifiers unlocked for the mission. */
    grantedSquadAbilities: string[];
}

/**
 * Project an Oath definition into the state a leader's actor needs to
 * track once the Oath is sworn: the active id, the mission-duration
 * buff payload, and the list of Squad-Mode abilities now available to
 * the kill-team.
 *
 * This function does NOT gate on leader-status / single-Oath rules —
 * call {@link canSwearOath} first if you need RAW gating. GM fiat can
 * override gating, but the projection itself is mechanical.
 *
 * The returned `grantedSquadAbilities` is a defensive copy so callers
 * may freely sort / filter / mutate it without poisoning the compendium-
 * resolved definition.
 */
export function swearOath(args: SwearOathArgs): SwearOathResult {
    return {
        activeOathId: args.oath.id,
        missionBuff: args.oath.buff,
        grantedSquadAbilities: [...args.oath.grantedSquadAbilities],
    };
}

/** Result shape for {@link releaseOath}. */
export interface ReleaseOathResult {
    /** The cleared active-Oath id (always `null`). */
    activeOathId: null;
}

/**
 * Clear the leader's active Oath. RAW: an Oath persists for the
 * mission; this is the bookkeeping hook for mission-end, leader death,
 * or GM-fiat oath breaking. Side-effects (removing Active Effects,
 * relocking unlocked Squad-Mode abilities) are the caller's job.
 */
export function releaseOath(): ReleaseOathResult {
    return { activeOathId: null };
}

/**
 * Convenience predicate: is an Oath currently active? `null` means no
 * Oath sworn; any non-null string is treated as an active id (this
 * module does not validate that the id resolves in the compendium —
 * that's the caller's concern, and it's already done at swear time).
 */
export function isOathActive(activeOathId: string | null): boolean {
    return activeOathId !== null;
}
