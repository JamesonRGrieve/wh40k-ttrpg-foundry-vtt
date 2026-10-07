import type { WeaponRollData } from '../rolls/roll-data.ts';
import { hitLocationNames } from './hit-locations.ts';
import { resolveTwoWeaponPenalties, type TwoWeaponTalent } from './two-weapon-fighting.ts';

type CombatAction = {
    name: string;
    type: string[];
    subtype: string[];
    description: string;
    attack?: {
        modifier: number;
    };
};

/** The slice of {@link WeaponRollData} that {@link calculateCombatActionModifier}
 *  reads/writes — narrowed so callers (and structural test mocks) satisfy it
 *  without fabricating a whole WeaponRollData. */
export type CombatActionModifierInput = Pick<
    WeaponRollData,
    'actions' | 'action' | 'isCalledShot' | 'calledShotLocation' | 'modifiers' | 'sourceActor' | 'weapon' | 'twoWeaponPlan'
>;

/** The canonical action name whose penalties {@link resolveTwoWeaponPenalties} owns. */
const TWO_WEAPON_ACTION = 'Two-Weapon Fighting';

/**
 * The actor's owned talents as the talent-gated rules read them: each one's
 * document `system.identifier` and the `system.specialization` picked.
 *
 * Reads the owned `talent` items in one pass so the rule receives the actor's
 * real talent state, matched by identifier rather than display name.
 * @param {CombatActionModifierInput['sourceActor']} actor  The acting actor, if any.
 * @returns {TwoWeaponTalent[]}  The owned talents.
 */
function ownedTalents(actor: CombatActionModifierInput['sourceActor']): TwoWeaponTalent[] {
    const talents: TwoWeaponTalent[] = [];
    for (const item of actor?.items ?? []) {
        if (item.type !== 'talent') continue;
        const system = item.system as { identifier?: string; specialization?: string | null };
        talents.push({ identifier: system.identifier ?? '', specialization: system.specialization ?? '' });
    }
    return talents;
}

/**
 * @param rollData {WeaponRollData}
 */
export function calculateCombatActionModifier(rollData: CombatActionModifierInput): void {
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

    // The combat-action modifier (Called Shot −20, Charge +20, All Out Attack
    // +30, …) gets its OWN key so it does not clobber the weapon's attackBonus,
    // which also writes modifiers['attack'] in RollData.update(). Previously
    // whichever ran last won, silently dropping the Called Shot −20 (#408).
    const actionInfo = allCombatActions().find((action: CombatAction) => action.name === currentAction);
    rollData.modifiers['combat-action'] = actionInfo?.attack?.modifier ?? 0;

    // Two-Weapon Fighting's penalties are talent-dependent, so they cannot be a
    // fixed `attack.modifier` on the action entry like Called Shot's −20 (#517).
    // Without this the action carried no modifier at all: its description promised
    // −20/−20 with Wielder/Master/Ambidextrous handling and named the resolver
    // that implements it, while the resolver had no caller and the attack went in
    // unmodified — strictly BETTER than RAW, which is why nobody reported it.
    if (rollData.action === TWO_WEAPON_ACTION) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/no-unnecessary-boolean-literal-compare -- defensive: `weapon` is declared optional but the non-strict config widens it to always-present, so the compiler reports this guard as redundant; a two-weapon action can still be selected before a weapon is chosen
        const isMelee = rollData.weapon?.isMelee === true;
        const penalties = resolveTwoWeaponPenalties({ isMelee, talents: ownedTalents(rollData.sourceActor) });
        rollData.modifiers['combat-action'] = penalties.mainPenalty;
        // The off-hand figure is carried rather than applied: it belongs to the
        // Free-Action follow-up, which is a second attack the player declares.
        rollData.twoWeaponPlan = { isMelee, mainPenalty: penalties.mainPenalty, offPenalty: penalties.offPenalty };
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
            description: 'A single melee or ranged attack. Ranged rolls of 96+ jam.',
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
            description: 'Half Action BS test to lob a grenade or thrown weapon. The weapon sets the range; on a miss it lands 1d5m off in a random direction.',
            attack: {
                modifier: 0,
            },
        },
        {
            name: 'Aim',
            type: ['Full', 'Half'],
            subtype: ['Concentration'],
            description: 'Next attack gains +10 (Half) or +20 (Full). Using a Reaction first throws the aim away.',
        },
        {
            name: 'All Out Attack',
            type: ['Full'],
            subtype: ['Attack', 'Melee'],
            description: '+30 WS, paid for by forfeiting Evasion this round.',
            attack: {
                modifier: 30,
            },
        },
        {
            name: 'Brace Heavy Weapon',
            type: ['Half'],
            subtype: ['Miscellaneous'],
            description: 'Set a Heavy weapon on a support (firing it unbraced costs -30 BS). The brace survives turning up to 45 degrees.',
        },
        {
            name: 'Called Shot',
            type: ['Full'],
            subtype: ['Attack', 'Concentration', 'Melee', 'Ranged'],
            description: 'Choose the hit location; -20 WS/BS.',
            attack: {
                modifier: -20,
            },
        },
        {
            name: 'Charge',
            type: ['Full'],
            subtype: ['Attack', 'Melee', 'Movement'],
            description: 'Rush up to 3x AgB, the final 4m straight at the foe; +20 WS.',
            attack: {
                modifier: 20,
            },
        },
        {
            name: 'Defensive Stance',
            type: ['Full'],
            subtype: ['Concentration', 'Melee'],
            description: 'One extra Reaction; foes take -20 WS against the character.',
        },
        {
            name: 'Delay',
            type: ['Full'],
            subtype: ['Miscellaneous'],
            description: 'Hold a Half Action and spend it whenever you like before your next turn; an attack made this way counts toward that next turn.',
        },
        {
            name: 'Disengage',
            type: ['Full'],
            subtype: ['Movement'],
            description: 'Leave melee; adjacent foes get no free strike.',
        },
        {
            name: 'Evasion',
            type: ['Reaction'],
            subtype: ['Movement'],
            description:
                'Dodge (any attack) or Parry (melee only) to avoid a hit. Against an area attack, it only works if a Half Move would carry the character clear of the area.',
        },
        {
            name: 'Feint',
            type: ['Half'],
            subtype: ['Attack', 'Melee'],
            description: 'Opposed WS; on a win the next melee attack is immune to Evasion.',
        },
        {
            name: 'Full Auto Burst',
            type: ['Half'],
            subtype: ['Attack', 'Ranged'],
            description: '-10 BS; each DoS adds a hit; 94+ jams; hits spread 2m.',
            attack: {
                modifier: -10,
            },
        },
        {
            name: 'Grapple',
            type: ['Half', 'Full'],
            subtype: ['Attack', 'Melee'],
            description: 'Act on a foe held in a grapple, or try to break loose.',
        },
        {
            name: 'Guarded Action',
            type: ['Half'],
            subtype: ['Attack', 'Concentration', 'Melee'],
            description: '-10 WS/BS on the attack; Evasion tests get +10 until your next turn begins.',
            attack: {
                modifier: -10,
            },
        },
        {
            name: 'Jump or Leap',
            type: ['Full'],
            subtype: ['Movement'],
            description: 'Clear a gap or reach upward.',
        },
        {
            name: 'Knock Down',
            type: ['Half'],
            subtype: ['Attack', 'Melee'],
            description: 'Opposed Strength (+10 after a Charge). Winning by 2+ DoS also deals (1d5-3)+SB Impact and 1 Fatigue.',
        },
        {
            name: 'Lightning Attack',
            type: ['Half'],
            subtype: ['Attack', 'Melee'],
            description: '-10 WS; each DoS adds a hit.',
            attack: {
                modifier: -10,
            },
        },
        {
            name: 'Manoeuvre',
            type: ['Half'],
            subtype: ['Attack', 'Movement', 'Melee'],
            description:
                'Opposed WS against an engaged foe. On a win, shove them up to 1m any direction and optionally follow 1m. Walls and bodies block the shove; drops and ledges do not.',
            attack: {
                modifier: 0,
            },
        },
        {
            name: 'Overwatch',
            type: ['Full'],
            subtype: ['Attack', 'Concentration', 'Ranged'],
            description:
                'Watch a 45-degree arc and fire on anything that enters it and matches your chosen conditions, using a pre-declared Standard, Semi-Auto or Full-Auto attack. Anyone shot at must pass a +0 Pinning test or be Pinned, damaged or not.',
        },
        {
            name: 'Ready',
            type: ['Half'],
            subtype: ['Miscellaneous'],
            description:
                'Draw or stow a weapon or item, bind a wound, or poison a blade. Letting go of an item is free. Two Readies can handle two separate items.',
        },
        {
            name: 'Reload',
            type: ['Half', 'Full'],
            subtype: ['Miscellaneous'],
            description:
                'Refill a ranged weapon; how long it takes is set by the weapon. A reload spanning several turns is an Extended action and can be interrupted or need extra tests.',
        },
        {
            name: 'Semi-Auto Burst',
            type: ['Half'],
            subtype: ['Attack', 'Ranged'],
            description: '+0 BS; every 2 DoS beyond the first adds a hit; 94+ jams; hits spread 2m.',
            attack: {
                modifier: 0,
            },
        },
        {
            name: 'Stun',
            type: ['Half'],
            subtype: ['Attack', 'Melee'],
            description:
                'Melee WS test at -20. On a hit roll 1d10+SB against the target TB + head AP; if it meets or beats that, the target is Stunned for as many rounds as the margin.',
            attack: {
                modifier: -20,
            },
        },
        {
            name: 'Suppressing Fire - Semi',
            type: ['Full'],
            subtype: ['Attack', 'Ranged'],
            description: 'Semi-auto burst sprayed over a 30-degree arc at -20 BS; everyone in the arc tests Pinning at -10 or is Pinned.',
            attack: {
                modifier: -20,
            },
        },
        {
            name: 'Suppressing Fire - Full',
            type: ['Full'],
            subtype: ['Attack', 'Ranged'],
            description: 'Full-auto burst sprayed over a 45-degree arc at -20 BS; everyone in the arc tests Pinning at -20 or is Pinned.',
            attack: {
                modifier: -20,
            },
        },
        {
            name: 'Swift Attack',
            type: ['Half'],
            subtype: ['Attack', 'Melee'],
            description: '+0 WS; every 2 DoS beyond the first adds a hit.',
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
                'Errata p. 132: open with one Half-Action attack from either weapon (Standard/Swift/Lightning melee, or single/semi/full-auto ranged). Two-Weapon Wielder (Melee/Ranged) adds one matching Half-Action attack with the other weapon as a Free Action. Both start at −20; Wielder clears the main-hand penalty, Two-Weapon Master clears both, Ambidextrous trims a further 10 off the off-hand. See `rules/two-weapon-fighting.ts:resolveTwoWeaponRefocus()`.',
        },
        {
            name: 'Unjam',
            type: ['Full'],
            subtype: ['Miscellaneous', 'Ranged'],
            description:
                'Full Action BS test to free a jammed ranged weapon. Success clears it but dumps the loaded ammo, so it needs a reload. Failure leaves it jammed; try again next round.',
        },
        {
            name: 'Tactical Advance',
            type: ['Full'],
            subtype: ['Concentration', 'Movement'],
            description: 'Half Move between cover positions, keeping the old cover bonus while in transit.',
        },
    ];
}
