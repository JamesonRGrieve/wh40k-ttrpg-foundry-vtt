/**
 * @file Attack Options Configuration
 * Structured data for all weapon attack dialog card-based options.
 * Used by the unified roll dialog weapon panel to render selectable cards.
 */

// ──────────────────────────────────────────────
// Attack Modes
// ──────────────────────────────────────────────

/**
 * Ranged attack mode options.
 * Each mode maps to an existing combat action by `actionName`.
 */
export const RANGED_ATTACK_MODES = [
    {
        key: 'standard',
        label: 'Standard Attack',
        actionName: 'Standard Attack',
        actionCost: 'Half',
        modifier: 0,
        icon: 'fas fa-crosshairs',
        tooltip: 'Single shot. +0 to BS. Jam on 96+.',
        default: true,
    },
    {
        key: 'semiAuto',
        label: 'Semi-Auto',
        actionName: 'Semi-Auto Burst',
        actionCost: 'Half',
        modifier: 10,
        icon: 'fas fa-burst',
        tooltip: 'Fire a burst. +10 BS. Additional hit per 2 DoS. Jam on 94+.',
        requires: (weapon) => (weapon.system.attack?.rateOfFire?.semi ?? 0) > 0,
    },
    {
        key: 'fullAuto',
        label: 'Full-Auto',
        actionName: 'Full Auto Burst',
        actionCost: 'Half',
        modifier: 20,
        icon: 'fas fa-arrows-split-up-and-left',
        tooltip: 'Spray fire. +20 BS. Additional hit per DoS. Jam on 94+.',
        requires: (weapon) => (weapon.system.attack?.rateOfFire?.full ?? 0) > 0,
    },
    {
        key: 'suppressingFull',
        label: 'Suppressing Fire',
        actionName: 'Suppressing Fire - Full',
        actionCost: 'Full',
        modifier: -20,
        icon: 'fas fa-shield-virus',
        tooltip: 'Full-auto in 45° arc at -20 BS. Enemies must pass -20 Pinning test.',
        requires: (weapon) => (weapon.system.attack?.rateOfFire?.full ?? 0) > 0,
    },
    {
        key: 'overwatch',
        label: 'Overwatch',
        actionName: 'Overwatch',
        actionCost: 'Full',
        modifier: 0,
        icon: 'fas fa-eye',
        tooltip: 'Set a 45° kill zone. React to targets entering with chosen attack. Targets must test Pinning.',
    },
    {
        key: 'calledShot',
        label: 'Called Shot',
        actionName: 'Called Shot',
        actionCost: 'Full',
        modifier: -20,
        icon: 'fas fa-bullseye',
        tooltip: 'Target a specific location. -20 BS.',
    },
];

/**
 * Melee standard attack mode options.
 */
export const MELEE_ATTACK_MODES = [
    {
        key: 'standard',
        label: 'Standard Attack',
        actionName: 'Standard Attack',
        actionCost: 'Half',
        modifier: 10,
        icon: 'fas fa-sword',
        tooltip: 'Basic melee strike. +10 to WS.',
        default: true,
    },
    {
        key: 'charge',
        label: 'Charge',
        actionName: 'Charge',
        actionCost: 'Full',
        modifier: 20,
        icon: 'fas fa-person-running',
        tooltip: 'Move up to 3× AgB (last 4m straight), +20 WS.',
    },
    {
        key: 'allOutAttack',
        label: 'All-Out Attack',
        actionName: 'All Out Attack',
        actionCost: 'Full',
        modifier: 30,
        icon: 'fas fa-hand-fist',
        tooltip: 'Sacrifice Evasion reaction for +30 WS.',
    },
    {
        key: 'guardedAttack',
        label: 'Guarded Attack',
        actionName: 'Guarded Action',
        actionCost: 'Half',
        modifier: -10,
        icon: 'fas fa-shield',
        tooltip: '-10 WS, but +10 to all Evasion tests until next turn.',
    },
    {
        key: 'calledShot',
        label: 'Called Shot',
        actionName: 'Called Shot',
        actionCost: 'Full',
        modifier: -20,
        icon: 'fas fa-bullseye',
        tooltip: 'Target a specific location. -20 WS.',
    },
];

/**
 * Melee special options (collapsible section).
 */
export const MELEE_SPECIAL_OPTIONS = [
    {
        key: 'feint',
        label: 'Feint',
        actionName: 'Feint',
        actionCost: 'Half',
        modifier: 0,
        icon: 'fas fa-face-meh-blank',
        tooltip: 'Opposed WS test. If you win, next melee attack cannot be Evaded.',
    },
    {
        key: 'knockdown',
        label: 'Knockdown',
        actionName: 'Knock Down',
        actionCost: 'Half',
        modifier: 0,
        icon: 'fas fa-person-falling',
        tooltip: 'On hit, opposed Strength test (+10 if Charging). 2+ DoS deals (1d5−3)+SB Impact and 1 Fatigue.',
    },
    {
        key: 'stun',
        label: 'Stun',
        actionName: 'Stun',
        actionCost: 'Half',
        modifier: -20,
        icon: 'fas fa-stars',
        tooltip: 'Melee attack at -20 WS. On hit, 1d10+SB vs TB+(head AP). Stun for rounds equal to difference.',
    },
    {
        key: 'manoeuvre',
        label: 'Manoeuvre',
        actionName: 'Manoeuvre',
        actionCost: 'Half',
        modifier: 0,
        icon: 'fas fa-arrows-up-down-left-right',
        tooltip: 'Opposed WS test. Move opponent up to 1m in chosen direction. Cannot push into obstacles.',
    },
];

// ──────────────────────────────────────────────
// Aim Options
// ──────────────────────────────────────────────

export const AIM_OPTIONS = [
    {
        key: 'none',
        label: 'No Aim',
        actionCost: null,
        modifier: 0,
        icon: 'fas fa-minus',
        tooltip: 'No aim bonus applied.',
        default: true,
    },
    {
        key: 'half',
        label: 'Half Aim',
        actionCost: 'Half',
        modifier: 10,
        icon: 'fas fa-crosshairs',
        tooltip: 'Spend a Half Action aiming. +10 to next attack. Lost if you take a Reaction.',
    },
    {
        key: 'full',
        label: 'Full Aim',
        actionCost: 'Full',
        modifier: 20,
        icon: 'fas fa-bullseye',
        tooltip: 'Spend a Full Action aiming. +20 to next attack. Lost if you take a Reaction.',
    },
];

// ──────────────────────────────────────────────
// Situational Modifiers
// ──────────────────────────────────────────────

/**
 * Situational modifiers for ranged attacks (multi-select).
 */
export const RANGED_SITUATIONAL_MODIFIERS = [
    {
        key: 'prone',
        label: 'Prone',
        modifier: -10,
        icon: 'fas fa-person-arrow-down-to-line',
        tooltip: 'Shooter or target is lying flat. -10 to ranged attacks.',
    },
    {
        key: 'unawareTarget',
        label: 'Unaware Target',
        modifier: 30,
        icon: 'fas fa-ear-deaf',
        tooltip: "Target doesn't know you're there. +30 to attack.",
    },
    {
        key: 'engagedInMelee',
        label: 'Engaged in Melee',
        modifier: -20,
        icon: 'fas fa-people-arrows',
        tooltip: 'Shooting into melee combat. -20 to ranged attacks.',
    },
    {
        key: 'darkness',
        label: 'Darkness',
        modifier: -30,
        icon: 'fas fa-moon',
        tooltip: 'Low or no visibility conditions. -30 to ranged attacks.',
    },
    {
        key: 'highGround',
        label: 'High Ground',
        modifier: 10,
        icon: 'fas fa-mountain',
        tooltip: 'Elevated position over target. +10 to ranged attacks.',
    },
    {
        key: 'stunnedTarget',
        label: 'Stunned Target',
        modifier: 20,
        icon: 'fas fa-dizzy',
        tooltip: 'Target is stunned and unable to react. +20 to attack.',
    },
];

/**
 * Situational modifiers for melee attacks (multi-select).
 */
export const MELEE_SITUATIONAL_MODIFIERS = [
    {
        key: 'proneTarget',
        label: 'Prone Target',
        modifier: 10,
        icon: 'fas fa-person-arrow-down-to-line',
        tooltip: 'Target is on the ground. +10 to melee attacks.',
    },
    {
        key: 'unawareTarget',
        label: 'Unaware Target',
        modifier: 30,
        icon: 'fas fa-ear-deaf',
        tooltip: "Target doesn't know you're there. +30 to attack.",
    },
    {
        key: 'darkness',
        label: 'Darkness',
        modifier: -20,
        icon: 'fas fa-moon',
        tooltip: 'Low or no visibility conditions. -20 to melee attacks.',
    },
    {
        key: 'gangingUp',
        label: 'Ganging Up',
        modifier: 10,
        icon: 'fas fa-users',
        tooltip: 'Multiple attackers on the same target. +10 to melee attacks.',
    },
    {
        key: 'stunnedTarget',
        label: 'Stunned Target',
        modifier: 20,
        icon: 'fas fa-dizzy',
        tooltip: 'Target is stunned and unable to react. +20 to attack.',
    },
];

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/**
 * Get attack modes filtered by weapon capabilities.
 * @param {Item} weapon - The weapon item
 * @returns {Array} Attack modes with `available` flag set
 */
export function getAvailableAttackModes(weapon) {
    const modes = weapon.isRanged ? RANGED_ATTACK_MODES : MELEE_ATTACK_MODES;
    return modes.map((mode) => ({
        ...mode,
        available: mode.requires ? mode.requires(weapon) : true,
    }));
}

/**
 * Get melee special options with availability.
 * @returns {Array} Special options (always available for melee weapons)
 */
export function getMeleeSpecialOptions() {
    return MELEE_SPECIAL_OPTIONS.map((opt) => ({
        ...opt,
        available: true,
    }));
}

/**
 * Get situational modifiers for the weapon type.
 * @param {boolean} isRanged - Whether the weapon is ranged
 * @returns {Array} Situational modifier options
 */
export function getSituationalModifiers(isRanged) {
    return isRanged ? RANGED_SITUATIONAL_MODIFIERS : MELEE_SITUATIONAL_MODIFIERS;
}

/**
 * Look up the combat action name for a given attack mode key.
 * @param {string} modeKey - The attack mode key
 * @param {boolean} isRanged - Whether the weapon is ranged
 * @returns {string|null} The combat action name, or null
 */
export function getActionNameForMode(modeKey, isRanged) {
    const allModes = [
        ...(isRanged ? RANGED_ATTACK_MODES : MELEE_ATTACK_MODES),
        ...MELEE_SPECIAL_OPTIONS,
    ];
    return allModes.find((m) => m.key === modeKey)?.actionName ?? null;
}

/**
 * Look up aim modifier value for a given aim key.
 * @param {string} aimKey - The aim option key
 * @returns {number} Modifier value
 */
export function getAimModifier(aimKey) {
    return AIM_OPTIONS.find((a) => a.key === aimKey)?.modifier ?? 0;
}

/**
 * Reverse lookup: find the card key for a given combat action name.
 * @param {string} actionName - The combat action name (e.g., "Standard Attack")
 * @param {boolean} isRanged - Whether the weapon is ranged
 * @returns {string} The card key (e.g., "standard")
 */
export function getAttackModeKeyForAction(actionName, isRanged) {
    const modes = isRanged ? RANGED_ATTACK_MODES : MELEE_ATTACK_MODES;
    const found = modes.find((m) => m.actionName === actionName);
    if (found) return found.key;
    if (!isRanged) {
        const special = MELEE_SPECIAL_OPTIONS.find((m) => m.actionName === actionName);
        if (special) return special.key;
    }
    return 'standard';
}

/**
 * Reverse lookup: find the aim key for a given modifier value.
 * @param {number} modifier - The aim modifier value
 * @returns {string} The aim key
 */
export function getAimKeyForModifier(modifier) {
    const found = AIM_OPTIONS.find((a) => a.modifier === modifier);
    return found?.key ?? 'none';
}

/**
 * Check if an attack mode key is a "special" melee option (collapsible section).
 * @param {string} key - Attack mode key
 * @returns {boolean}
 */
export function isMeleeSpecialOption(key) {
    return MELEE_SPECIAL_OPTIONS.some((opt) => opt.key === key);
}
