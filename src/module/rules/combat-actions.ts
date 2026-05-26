import type { WeaponRollData } from '../rolls/roll-data.ts';
import { hitLocationNames } from './hit-locations.ts';

type CombatAction = {
    name: string;
    type: string[];
    subtype: string[];
    description: string;
    attack?: {
        modifier: number;
    };
};

/**
 * @param rollData {WeaponRollData}
 */
export function calculateCombatActionModifier(rollData: WeaponRollData): void {
    // eslint-disable-next-line no-restricted-syntax -- boundary: rollData.actions stores per-system action name→name map; values are strings at runtime
    const actions = rollData.actions as Record<string, string>;
    const currentAction = actions[rollData.action];

    game.wh40k.log('calculateCombatActionModifier', currentAction);
    if (rollData.action === 'Called Shot') {
        if (!rollData.isCalledShot) {
            rollData.isCalledShot = true;
            rollData.calledShotLocation = hitLocationNames()[0];
        }
    } else {
        rollData.isCalledShot = false;
    }

    const actionInfo = allCombatActions().find((action: CombatAction) => action.name === currentAction);
    if (actionInfo?.attack?.modifier !== undefined && actionInfo.attack.modifier !== 0) {
        rollData.modifiers['attack'] = actionInfo.attack.modifier;
    } else {
        rollData.modifiers['attack'] = 0;
    }
}

/**
 * @param rollData {WeaponRollData}
 */
export function updateAvailableCombatActions(rollData: WeaponRollData): void {
    const weaponAttack = rollData.weapon.system['attack'] as { rateOfFire?: { semi?: number; full?: number } } | undefined;
    // Thrown weapons (class 'thrown') report `isRanged === true` but use the
    // dedicated Throw half-action rather than the BS shooting actions
    // (Standard Attack / Semi-Auto / Full-Auto). Conversely, Throw is only
    // available to thrown weapons. RAW DH2 "Throw" is a Half Action using BS,
    // with range derived from the weapon's own range data (Strength-Bonus based).
    const isThrownWeapon = rollData.weapon.isThrown;

    const actions = allCombatActions()
        .filter((action) => action.subtype.includes('Attack'))
        .filter((action) => {
            const isThrowAction = action.subtype.includes('Thrown');
            if (rollData.weapon.isRanged) {
                if (isThrownWeapon) {
                    // Only the Throw action (and any action explicitly tagged Thrown).
                    return isThrowAction;
                }
                // Non-thrown ranged weapons never offer Throw.
                return !isThrowAction && action.subtype.includes('Ranged');
            } else {
                return !isThrowAction && action.subtype.includes('Melee');
            }
        });

    if (rollData.hasAttackSpecial('Unbalanced') || rollData.hasAttackSpecial('Unwieldy')) {
        actions.findSplice((action) => action.name === 'Lightning Attack');
    }

    if (rollData.weapon.isRanged) {
        const rof = weaponAttack?.rateOfFire;
        if (!rof || (rof.semi ?? 0) <= 0) {
            actions.findSplice((action) => action.name === 'Semi-Auto Burst');
            actions.findSplice((action) => action.name === 'Suppressing Fire - Semi');
        }
        if (!rof || (rof.full ?? 0) <= 0) {
            actions.findSplice((action) => action.name === 'Full Auto Burst');
            actions.findSplice((action) => action.name === 'Suppressing Fire - Full');
        }
    }

    rollData.actions = {};
    // eslint-disable-next-line no-restricted-syntax -- boundary: rollData.actions stores per-system action name→name map; values are strings at runtime
    const actionsByName = rollData.actions as Record<string, string>;
    // eslint-disable-next-line no-restricted-syntax -- boundary: combatActionInformation stores per-system CombatAction objects; typed as unknown to avoid import cycle
    rollData.combatActionInformation = actions as unknown as Record<string, unknown>;
    for (const action of actions) {
        actionsByName[action.name] = action.name;
    }

    // If action no longer exists -- set to first available
    if (Object.keys(actionsByName).find((a) => a === rollData.action) === undefined) {
        const firstKey = Object.keys(actionsByName)[0];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: Object.keys()[0] may be undefined at runtime
        if (firstKey !== undefined) {
            rollData.action = actionsByName[firstKey] ?? '';
        }
    }
}

/**
 * Resolution path for a thrown weapon under the Throw half-action.
 *
 * - `grenade-dialog`: the item is a grenade (explosive payload). The
 *   blast / scatter / damage emission is owned by the Within-grenade
 *   registry + {@link GrenadeThrowDialog}; the Throw action reuses that
 *   path rather than duplicating the blast logic.
 * - `weapon-roll`: an ordinary thrown weapon (knife, throwing axe). It
 *   resolves through the normal weapon-roll pipeline, which already
 *   applies the thrown BS attack and scatters a miss (see
 *   `rolls/action-data.ts`).
 */
export type ThrowResolutionPath = 'grenade-dialog' | 'weapon-roll';

/** Item surface the throw classifier reads — content-driven, no name matching. */
interface ThrowableWeaponLike {
    isThrown?: boolean;
    system?: { special?: string | string[] };
}

/**
 * Decide how a thrown weapon's Throw action resolves. The grenade marker
 * is the `grenade` weapon-quality on the item's `special` list — the same
 * content-driven classifier `acolyte.ts:rollWeaponDamage` already uses to
 * decide Strength-Bonus inclusion (Direction #7 — never a hardcoded
 * weapon name). Grenades route to the grenade dialog so the blast /
 * scatter / damage path is reused; ordinary thrown weapons resolve
 * through the normal weapon roll (which already throws on BS and
 * scatters a miss).
 */
export function throwResolutionPath(weapon: ThrowableWeaponLike): ThrowResolutionPath {
    const special = weapon.system?.special;
    const isGrenade = Array.isArray(special) ? special.includes('grenade') : typeof special === 'string' && special.includes('grenade');
    return isGrenade ? 'grenade-dialog' : 'weapon-roll';
}

export function allCombatActions(): CombatAction[] {
    return [
        {
            name: 'Standard Attack',
            type: ['Half'],
            subtype: ['Attack', 'Melee', 'Ranged'],
            description: 'Make one melee or ranged attack; jam on 96+ result.',
            attack: {
                modifier: 0,
            },
        },
        {
            // DH2 Core "Throw" (Half Action): hurl a grenade or thrown weapon.
            // Resolves as a Ballistic Skill attack (thrown weapons are ranged),
            // with maximum range read from the weapon's own range data
            // (Strength-Bonus-based formula); a miss scatters per the scatter
            // diagram. No flat attack modifier — RAW applies no inherent
            // bonus/penalty to the Throw test itself.
            name: 'Throw',
            type: ['Half'],
            subtype: ['Attack', 'Ranged', 'Thrown'],
            description: 'Throw a grenade or thrown weapon (Half Action, BS test). Range comes from the weapon; a miss scatters 1d5m in a random direction.',
            attack: {
                modifier: 0,
            },
        },
        {
            name: 'Aim',
            type: ['Full', 'Half'],
            subtype: ['Concentration'],
            description: "Grants +10 (Half) or +20 (Full) bonus to character's next attack. Taking a Reaction will remove the bonus from Aiming.",
        },
        {
            name: 'All Out Attack',
            type: ['Full'],
            subtype: ['Attack', 'Melee'],
            description: "Give up that round's Evasion reaction to gain +30 WS.",
            attack: {
                modifier: 30,
            },
        },
        {
            name: 'Brace Heavy Weapon',
            type: ['Half'],
            subtype: ['Miscellaneous'],
            description: 'Support a Heavy weapon. Unbraced heavy weapons incur -30 to BS. May pivot 45-degrees without losing bracing.',
        },
        {
            name: 'Called Shot',
            type: ['Full'],
            subtype: ['Attack', 'Concentration', 'Melee', 'Ranged'],
            description: 'Attack a specific location on a target with a -20 to WS or BS.',
            attack: {
                modifier: -20,
            },
        },
        {
            name: 'Charge',
            type: ['Full'],
            subtype: ['Attack', 'Melee', 'Movement'],
            description: 'Move up to 3x AgB (last 4m in straight line at enemy), +20 to WS.',
            attack: {
                modifier: 20,
            },
        },
        {
            name: 'Defensive Stance',
            type: ['Full'],
            subtype: ['Concentration', 'Melee'],
            description: 'Gain an additional Reaction. Opponents suffer -20 WS.',
        },
        {
            name: 'Delay',
            type: ['Full'],
            subtype: ['Miscellaneous'],
            description: "May take any Half Action at any time before character's next turn. Attacks count as being part of the next turn.",
        },
        {
            name: 'Disengage',
            type: ['Full'],
            subtype: ['Movement'],
            description: 'Break from melee without incurring a free attack.',
        },
        {
            name: 'Evasion',
            type: ['Reaction'],
            subtype: ['Movement'],
            description:
                'Attempt to avoid an attack by using Dodge (ranged or melee) or Parry (melee) skills. Evading an area of effect attack requires the character be able to escape the radius by moving no further than a Half Move.',
        },
        {
            name: 'Feint',
            type: ['Half'],
            subtype: ['Attack', 'Melee'],
            description: 'Opposed WS test; if character wins, his next Melee attack cannot be Evaded.',
        },
        {
            name: 'Full Auto Burst',
            type: ['Half'],
            subtype: ['Attack', 'Ranged'],
            description: 'Grants +20 BS, one hit for every DoS; Jam on 94+ result; 2m spread.',
            attack: {
                modifier: 20,
            },
        },
        {
            name: 'Grapple',
            type: ['Half', 'Full'],
            subtype: ['Attack', 'Melee'],
            description: 'Affect a Grappled opponent or escape from a Grapple.',
        },
        {
            name: 'Guarded Action',
            type: ['Half'],
            subtype: ['Attack', 'Concentration', 'Melee'],
            description: 'Grants -10 to WS or BS, +10 to all Evasion tests until start of next turn.',
            attack: {
                modifier: -10,
            },
        },
        {
            name: 'Jump or Leap',
            type: ['Full'],
            subtype: ['Movement'],
            description: 'Jump vertically or leap horizontally.',
        },
        {
            name: 'Knock Down',
            type: ['Half'],
            subtype: ['Attack', 'Melee'],
            description: 'Make an opposed Strength test (with +10 if using Charge). 2+DoS gives (1d5-3)+SB Impact and 1 level of fatigue.',
        },
        {
            name: 'Lightning Attack',
            type: ['Half'],
            subtype: ['Attack', 'Melee'],
            description: 'Grants -10 WS, one hit for every DoS.',
            attack: {
                modifier: -10,
            },
        },
        {
            name: 'Manoeuvre',
            type: ['Half'],
            subtype: ['Attack', 'Movement', 'Melee'],
            description:
                'Make an opposed WS test against character in melee range; if successful, move them up to 1 metre in direction of choice (character may advance 1 metre as well). Cannot push into obstacles or characters, but can push off of cliffs or edges.',
            attack: {
                modifier: 0,
            },
        },
        {
            name: 'Overwatch',
            type: ['Full'],
            subtype: ['Attack', 'Concentration', 'Ranged'],
            description:
                'Shoot targets coming into a set 45-degree kill zone with Standard/Semi-Auto/Full-Auto attack (specify which) meeting certain criteria, as chosen by the player. Targets of an Overwatch shot must make a +0 Pinning test or become Pinned, even if the attack did no damage.',
        },
        {
            name: 'Ready',
            type: ['Half'],
            subtype: ['Miscellaneous'],
            description:
                'Ready a weapon or an item, apply a bandage or coat a blade with poison, stow an item securely in a bag. Dropping an item is considered a Free Action. Can used twice to affect 2 different items.',
        },
        {
            name: 'Reload',
            type: ['Half', 'Full'],
            subtype: ['Miscellaneous'],
            description:
                'Reload a ranged weapon - the time necessary depends on the specific weapon. If a reload action extends across multiple turns, it counts as being Extended, and is subject to additional tests or interruptions.',
        },
        {
            name: 'Semi-Auto Burst',
            type: ['Half'],
            subtype: ['Attack', 'Ranged'],
            description: 'Grants +0 BS, additional hit for every two additional DoS; jam on 94+; 2m spread.',
            attack: {
                modifier: 0,
            },
        },
        {
            name: 'Stun',
            type: ['Half'],
            subtype: ['Attack', 'Melee'],
            description:
                'Using melee weapon, WS test with -20. Success is 1d10+SB, vs targets TB+(AP on head). If success, target is stunned for the number of rounds equal to difference.',
            attack: {
                modifier: -20,
            },
        },
        {
            name: 'Suppressing Fire - Semi',
            type: ['Full'],
            subtype: ['Attack', 'Ranged'],
            description: 'Fires a semi-auto (in 30 degree arc) burst at -20 to BS. Enemies in the arc must make a -10 Pinning save or become pinned.',
            attack: {
                modifier: -20,
            },
        },
        {
            name: 'Suppressing Fire - Full',
            type: ['Full'],
            subtype: ['Attack', 'Ranged'],
            description: 'Fires a full-auto (in 45 degree arc) burst at -20 to BS. Enemies in the arc must make a -20 Pinning save or become pinned.',
            attack: {
                modifier: -20,
            },
        },
        {
            name: 'Swift Attack',
            type: ['Half'],
            subtype: ['Attack', 'Melee'],
            description: 'Grants +0 WS, additional hit for every two additional DoS.',
            attack: {
                modifier: 0,
            },
        },
        {
            name: 'Two-Weapon Fighting',
            // Errata p. 132: the opener is a single Half-Action attack
            // (Standard/Swift/Lightning melee or single-shot/semi-auto/
            // full-auto ranged); the Two-Weapon Wielder talent then grants
            // one additional same-mode Half-Action attack with the other
            // weapon as a Free Action. It is no longer a Full-Action lump.
            type: ['Half'],
            subtype: ['Attack', 'Melee', 'Ranged'],
            description:
                'Errata p. 132: make a Half-Action attack with one weapon (Standard/Swift/Lightning melee, or single shot/semi-auto burst/full-auto burst ranged). Two-Weapon Wielder (Melee/Ranged) then grants a single additional same-mode Half-Action attack with the other weapon as a Free Action. Baseline −20 to each; Wielder drops the main-hand penalty to 0, Two-Weapon Master drops both to 0, Ambidextrous reduces the off-hand penalty by an additional 10. See `rules/two-weapon-fighting.ts:resolveTwoWeaponRefocus()`.',
        },
        {
            name: 'Unjam',
            type: ['Full'],
            subtype: ['Miscellaneous', 'Ranged'],
            description:
                'Clear a jammed ranged weapon with a Full Action and a Ballistic Skill test. Success clears the jam, though any ammo loaded in the weapon is lost and the weapon must be reloaded. Failure leaves the jam in place; the character may attempt to clear it again next round.',
        },
        {
            name: 'Tactical Advance',
            type: ['Full'],
            subtype: ['Concentration', 'Movement'],
            description: 'Make a Half Move from one cover to another. Continue to take bonus from previous cover until reaching new one.',
        },
    ];
}
