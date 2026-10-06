/**
 * Two-weapon fighting penalty resolver.
 *
 * core.md §"Two-Weapon Fighting" (p. 228):
 *  - Baseline: −20 to both attack rolls when attacking with two weapons.
 *  - Two-Weapon Wielder (Melee/Ranged): drops the **main-hand** penalty to 0.
 *  - Two-Weapon Master (Melee/Ranged): drops **both** penalties to 0.
 *  - Ambidextrous: drops the **off-hand** penalty by an additional 10
 *    (cumulative with Wielder/Master).
 *
 * The talents are read from the fighter's owned talents by their
 * `system.identifier` (`twoWeaponWielder` / `twoWeaponMaster` /
 * `ambidextrous`) and, for Wielder and Master, the `system.specialization`
 * the character picked (Melee / Ranged) — never by display name.
 */

export interface TwoWeaponPenalties {
    /** Modifier applied to the main-hand attack test. Always ≤ 0. */
    mainPenalty: number;
    /** Modifier applied to the off-hand attack test. Always ≤ 0. */
    offPenalty: number;
}

/** One owned talent, as the resolver reads it: its document identifier and the specialisation picked. */
export interface TwoWeaponTalent {
    identifier: string;
    specialization: string;
}

export interface TwoWeaponContext {
    /** Whether the fighter is attacking with melee weapons (vs ranged) — gates the per-flavour Wielder/Master talent. */
    isMelee: boolean;
    /** The fighter's owned talents. */
    talents: readonly TwoWeaponTalent[];
}

const WIELDER_IDENTIFIER = 'twoWeaponWielder';
const MASTER_IDENTIFIER = 'twoWeaponMaster';
const AMBIDEXTROUS_IDENTIFIER = 'ambidextrous';

/**
 * Whether a Wielder / Master talent's picked specialisation covers this attack's
 * flavour. A blank specialisation (DH1's unspecialised Two-Weapon Wielder) covers
 * both; otherwise the specialisation must name Melee or Ranged.
 */
function coversFlavour(specialization: string, isMelee: boolean): boolean {
    const spec = specialization.trim().toLowerCase();
    if (spec === '') return true;
    return spec.includes(isMelee ? 'melee' : 'ranged');
}

/** Whether the fighter owns the talent `identifier` for this attack's flavour. */
function hasFlavourTalent(ctx: TwoWeaponContext, identifier: string): boolean {
    return ctx.talents.some((talent) => talent.identifier === identifier && coversFlavour(talent.specialization, ctx.isMelee));
}

/** Whether the fighter has the matching-flavour Wielder (or Master, which includes it). */
function hasWielderFor(ctx: TwoWeaponContext): boolean {
    return hasFlavourTalent(ctx, MASTER_IDENTIFIER) || hasFlavourTalent(ctx, WIELDER_IDENTIFIER);
}

/**
 * Resolve the main- and off-hand penalty pair for a two-weapon attack
 * given the fighter's talent state and weapon flavour.
 */
export function resolveTwoWeaponPenalties(ctx: TwoWeaponContext): TwoWeaponPenalties {
    const hasMaster = hasFlavourTalent(ctx, MASTER_IDENTIFIER);
    const hasWielder = hasWielderFor(ctx);
    const hasAmbidextrous = ctx.talents.some((talent) => talent.identifier === AMBIDEXTROUS_IDENTIFIER);

    // Baseline −20 / −20. Wielder zeroes main-hand. Master zeroes both.
    // Ambidextrous reduces the off-hand penalty by 10 (never raises above 0).
    const mainPenalty = hasWielder ? 0 : -20;
    let offPenalty = hasMaster ? 0 : -20;
    if (hasAmbidextrous) {
        offPenalty = Math.min(0, offPenalty + 10);
    }
    return { mainPenalty, offPenalty };
}

// ──────────────────────────────────────────────
// Errata p. 132 — Two-Weapon Wielder Half-Action refocus
// ──────────────────────────────────────────────
//
// errata/errata.md L67 — Two-Weapon Wielder (page 132): replace the second
// sentence with:
//
//   "When armed with two one-handed weapons (either melee or ranged
//    weapons), after making a Half Action attack (this can be a Standard
//    Attack, a Swift Attack, or a Lightning Attack with a melee weapon,
//    or it can be a single shot, semiauto burst, or full auto burst with
//    a ranged weapon), he can make a single additional Half Action attack
//    following the same restrictions with the other weapon as a Free
//    Action."
//
// The old text modelled this as a single Full-Action "Two-Weapon Fighting"
// lump. The errata restructures it: the first weapon makes one **Half
// Action** attack in a chosen mode, and the Wielder talent grants a
// **single additional Half Action attack of the SAME mode** with the
// other weapon as a **Free Action**. #106 added a penalty-pair regression
// only; this resolver pins the structural rule (mode validity, action
// economy, and the per-attack penalty pair) as the single source of truth
// the dispatch path reads, mirroring the `resolveTwoWeaponPenalties`
// contract above.
//
// FAQ p. 571: when combined with Devastating Assault the follow-up is
// restricted to a plain Standard Attack — callers pass that restriction
// in via `restrictToStandard`. FAQ p. 693: an Aim bonus applies only to
// the first (main-hand) attack — surfaced as `aimAppliesToOffHand: false`
// so the dispatch path does not double-count it.

/** Canonical action name of the chosen first Half-Action attack mode. */
export type TwoWeaponAttackMode =
    // melee
    | 'Standard Attack'
    | 'Swift Attack'
    | 'Lightning Attack'
    // ranged (single shot reuses the 'Standard Attack' action name; see
    // RANGED_ATTACK_MODES in attack-options.ts where key 'standard' →
    // actionName 'Standard Attack')
    | 'Semi-Auto Burst'
    | 'Full Auto Burst';

/** Per-flavour set of Half-Action attack modes the errata permits as the opener. */
const MELEE_REFOCUS_MODES: ReadonlySet<TwoWeaponAttackMode> = new Set<TwoWeaponAttackMode>(['Standard Attack', 'Swift Attack', 'Lightning Attack']);
const RANGED_REFOCUS_MODES: ReadonlySet<TwoWeaponAttackMode> = new Set<TwoWeaponAttackMode>(['Standard Attack', 'Semi-Auto Burst', 'Full Auto Burst']);

/** One scheduled attack in the errata's two-Half-Action plan. */
interface TwoWeaponPlannedAttack {
    /** 'main' fires first with the main-hand weapon; 'off' is the errata's Free-Action follow-up. */
    hand: 'main' | 'off';
    /** The combat-action name to invoke. Both attacks share the same mode (errata "following the same restrictions"). */
    actionName: TwoWeaponAttackMode;
    /** Action economy this attack consumes. The opener is a Half Action; the follow-up is a Free Action (errata). */
    actionCost: 'Half' | 'Free';
    /** Attack-test modifier for this hand, from `resolveTwoWeaponPenalties`. Always ≤ 0. */
    modifier: number;
}

export interface TwoWeaponRefocusContext extends TwoWeaponContext {
    /** The Half-Action attack mode chosen for the opening (main-hand) attack. */
    mode: TwoWeaponAttackMode;
    /**
     * FAQ p. 571 (Devastating Assault interaction): force the off-hand
     * follow-up to a plain Standard Attack regardless of the opener.
     * Defaults to false.
     */
    restrictToStandard?: boolean;
}

export interface TwoWeaponRefocusPlan {
    /**
     * True when the errata's Free-Action follow-up is granted: the
     * fighter has the matching-flavour Wielder/Master talent AND the
     * chosen mode is a legal Half-Action opener for that flavour.
     */
    granted: boolean;
    /**
     * The ordered attack plan. Always at least the main-hand Half Action;
     * the off-hand Free-Action follow-up is appended only when `granted`.
     * Both entries carry `actionCost: 'Half' | 'Free'` and an explicit
     * modifier — never a Full-Action lump and never Semi-Auto-Burst ×2
     * unless the opener itself was Semi-Auto Burst.
     */
    attacks: readonly TwoWeaponPlannedAttack[];
    /**
     * FAQ p. 693 — an Aim Half/Full bonus only applies to the attack
     * immediately following the Aim, i.e. the main-hand opener. The
     * dispatch path must NOT carry the Aim modifier onto the off-hand
     * follow-up.
     */
    aimAppliesToOffHand: false;
}

/** Is `mode` a Half-Action attack the errata permits as the two-weapon opener for this flavour? */
export function isTwoWeaponRefocusMode(mode: TwoWeaponAttackMode, isMelee: boolean): boolean {
    return (isMelee ? MELEE_REFOCUS_MODES : RANGED_REFOCUS_MODES).has(mode);
}

/**
 * Resolve the errata p. 132 two-Half-Action plan for a Two-Weapon
 * Wielder. Returns the main-hand Half-Action attack always, plus the
 * Free-Action same-mode off-hand follow-up when the talent + mode make
 * it legal. Per-hand modifiers come from `resolveTwoWeaponPenalties`,
 * so the modifier accumulation stays identical to the existing rule
 * (−20 baseline, Wielder → main 0, Master → both 0, Ambidextrous → off
 * +10 capped at 0).
 */
export function resolveTwoWeaponRefocus(ctx: TwoWeaponRefocusContext): TwoWeaponRefocusPlan {
    const hasWielder = hasWielderFor(ctx);
    const modeIsLegal = isTwoWeaponRefocusMode(ctx.mode, ctx.isMelee);
    const { mainPenalty, offPenalty } = resolveTwoWeaponPenalties(ctx);

    const mainAttack: TwoWeaponPlannedAttack = {
        hand: 'main',
        actionName: ctx.mode,
        actionCost: 'Half',
        modifier: mainPenalty,
    };

    // No matching-flavour Wielder/Master, or an illegal opener mode →
    // just the lone Half-Action attack, no Free-Action follow-up.
    if (!hasWielder || !modeIsLegal) {
        return { granted: false, attacks: [mainAttack], aimAppliesToOffHand: false };
    }

    // FAQ p. 571: Devastating Assault forces the follow-up to a plain
    // Standard Attack; otherwise the errata's "same restrictions" makes
    // the off-hand mirror the opener exactly.
    const offMode: TwoWeaponAttackMode = ctx.restrictToStandard === true ? 'Standard Attack' : ctx.mode;
    const offAttack: TwoWeaponPlannedAttack = {
        hand: 'off',
        actionName: offMode,
        actionCost: 'Free',
        modifier: offPenalty,
    };

    return { granted: true, attacks: [mainAttack, offAttack], aimAppliesToOffHand: false };
}
