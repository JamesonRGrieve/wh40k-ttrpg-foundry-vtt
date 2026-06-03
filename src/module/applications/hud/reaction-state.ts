/**
 * Pure reaction-state builder for the combat quick panel (#245).
 *
 * The panel previously listed Dodge and Parry unconditionally, showing a `(0)`
 * target for any actor lacking the skill (NPCs especially) — placeholder noise
 * rather than "the actual usable reactions." This collapses the state to only
 * the reactions the actor can actually perform (a real, positive skill TN),
 * each with its true target and whether it has already been spent this turn.
 *
 * Foundry-free so it can be unit-tested directly; the panel resolves the actor's
 * skill TNs and i18n labels and hands them in.
 */

/** A reaction the actor can actually perform. */
interface ReactionEntry {
    /** False once the reaction has been spent this turn (button disabled). */
    available: boolean;
    /** The real skill target number. */
    target: number;
    /** Localised label, e.g. "Dodge (45)". */
    label: string;
}

/** Reactions available to the actor this turn. Absent keys = not usable. */
export interface ReactionState {
    dodge?: ReactionEntry;
    parry?: ReactionEntry;
    /** Count of usable reactions not yet spent this turn. */
    remaining: number;
}

export interface ReactionInputs {
    /** Dodge skill target number (`system.skills.dodge.current`), if any. */
    dodgeTarget: number | undefined;
    /** Parry skill target number (`system.skills.parry.current`), if any. */
    parryTarget: number | undefined;
    dodgeUsed: boolean;
    parryUsed: boolean;
    /** Label builders: receive the TN, return the display string (i18n resolved by caller). */
    dodgeLabel: (target: number) => string;
    parryLabel: (target: number) => string;
}

/** Build a single entry, or `undefined` when the actor cannot use the reaction. */
function makeEntry(target: number | undefined, used: boolean, label: (target: number) => string): ReactionEntry | undefined {
    if (target === undefined || !Number.isFinite(target) || target <= 0) return undefined;
    return { available: !used, target, label: label(target) };
}

/** Collapse skill TNs + spent flags into the panel's reaction state. */
export function buildReactionState(inputs: ReactionInputs): ReactionState {
    const dodge = makeEntry(inputs.dodgeTarget, inputs.dodgeUsed, inputs.dodgeLabel);
    const parry = makeEntry(inputs.parryTarget, inputs.parryUsed, inputs.parryLabel);

    let remaining = 0;
    if (dodge?.available === true) remaining += 1;
    if (parry?.available === true) remaining += 1;

    const state: ReactionState = { remaining };
    if (dodge !== undefined) state.dodge = dodge;
    if (parry !== undefined) state.parry = parry;
    return state;
}
