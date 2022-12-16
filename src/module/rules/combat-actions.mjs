import { WeaponRollData } from '../rolls/roll-data.mjs';
import { hitLocationNames } from './hit-locations.mjs';

/**
 * @param rollData {WeaponRollData}
 */
export function calculateCombatActionModifier(rollData) {
    const currentAction = rollData.actions[rollData.action];

    game.dh.log('calculateCombatActionModifier', currentAction);
    if (rollData.action === 'Called Shot') {
        if(rollData.isCalledShot === false) {
            rollData.isCalledShot = true;
            rollData.calledShotLocation = hitLocationNames()[0];
        }
    } else {
        rollData.isCalledShot = false;
    }

    const actionInfo = allCombatActions().find(action => action.name === currentAction);
    if (actionInfo && actionInfo.attack?.modifier) {
        rollData.modifiers['attack'] = actionInfo.attack.modifier;
    } else {
        rollData.modifiers['attack'] = 0;
    }
}

/**
 * @param rollData {WeaponRollData}
 */
export function updateAvailableCombatActions(rollData) {
    const actions = allCombatActions()
        .filter((action) => action.subtype.includes('Attack'))
        .filter((action) => {
            if (rollData.weapon.isRanged) {
                return action.subtype.includes('Ranged');
            } else {
                return action.subtype.includes('Melee');
            }
        });

    if (rollData.hasAttackSpecial('Unbalanced') || rollData.hasAttackSpecial('Unwieldy')) {
        actions.findSplice((action) => action.name === 'Lightning Attack');
    }

    if (rollData.weapon.isRanged) {
        if (rollData.weapon.system.rateOfFire.burst <= 0) {
            actions.findSplice((action) => action.name === 'Semi-Auto Burst');
            actions.findSplice((action) => action.name === 'Suppressing Fire - Semi');
        }
        if (rollData.weapon.system.rateOfFire.full <= 0) {
            actions.findSplice((action) => action.name === 'Full Auto Burst');
            actions.findSplice((action) => action.name === 'Suppressing Fire - Full');
        }
    }

    rollData.actions = {};
    rollData.combatActionInformation = actions;
    for (let action of actions) {
        rollData.actions[action.name] = action.name;
    }

    // If action no longer exists -- set to first available
    if (!Object.keys(rollData.actions).find((a) => a === rollData.action)) {
        rollData.action = rollData.actions[Object.keys(rollData.actions)[0]];
    }
}

function allCombatActions() {
    return [
        {
            name: 'Standard Attack',
            type: ['Half'],
            subtype: ['Attack', 'Melee', 'Ranged'],
            description: 'Grants +10 to WS or BS, make one melee or ranged attack; jam on 96+ result.',
            attack: {
                modifier: 10,
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
            description: 'Grants -10 BS, one hit for every DoS; Jam on 94+ result; 2m spread.',
            attack: {
                modifier: -10,
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
            subtype: ['Concentration'],
            description: 'Grants -10 to WS or BS, +10 to all Evasion tests until start of next turn.',
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
            subtype: ['Movement', 'Melee'],
            description:
                'Make an opposed WS test against character in melee range; if successful, move them up to 1 metre in direction of choice (character may advance 1 metre as well). Cannot push into obstacles or characters, but can push off of cliffs or edges.',
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
            type: ['Half', 'Full', '2Full'],
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
            description:
                'Fires a semi-auto (in 30 degree arc) burst at -20 to BS. Enemies in the arc must make a -10 Pinning save or become pinned.',
            attack: {
                modifier: -20,
            },
        },
        {
            name: 'Suppressing Fire - Full',
            type: ['Full'],
            subtype: ['Attack', 'Ranged'],
            description:
                'Fires a full-auto (in 45 degree arc) burst at -20 to BS. Enemies in the arc must make a -20 Pinning save or become pinned.',
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
            name: 'Tactical Advance',
            type: ['Full'],
            subtype: ['Concentration', 'Movement'],
            description: 'Make a Half Move from one cover to another. Continue to take bonus from previous cover until reaching new one.',
        },
    ];
}
