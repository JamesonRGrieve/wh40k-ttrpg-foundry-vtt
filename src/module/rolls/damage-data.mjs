import { RollData } from './roll-data.mjs';
import { DarkHeresyItem } from '../documents/item.mjs';


export class DamageData {
    template = '';
    sourceActor;
    targetActor;

    hits = [];
}

export class Hit {
    location = '';
    damage = '';
    modifiers = {};
    dos = 0;
    penetration = '';
    specials = [];
    righteousFury = {};
    scatter = {};

    static determineHitLocation(roll) {
        const rollString = roll.toString().split('');
        const reverseArray = rollString.reverse();
        const joinArray = reverseArray.join('');

        const reverseInt = parseInt(joinArray);

        if (reverseInt <= 10) {
            return 'head';
        } else if (reverseInt <= 20) {
            return 'right arm';
        } else if (reverseInt <= 30) {
            return 'left arm';
        } else if (reverseInt <= 70) {
            return 'body';
        } else if (reverseInt <= 85) {
            return 'right leg';
        } else {
            return 'left leg';
        }
    }

    static nextHitLocation(location) {
        if (location === 'head') {
            return 'right arm';
        } else if (location === 'right arm') {
            return 'left arm';
        } else if (location === 'left arm') {
            return 'body';
        } else if (location === 'body') {
            return 'right leg';
        } else if (location === 'right leg') {
            return 'left leg';
        } else {
            return 'head';
        }
    }
}

export class WeaponDamageData extends DamageData {
    weapon: DarkHeresyItem;

    constructor() {
        super();
        this.template = 'systems/dark-heresy-2nd/templates/chat/weapon-roll-chat.hbs';
    }
}

export class PsychicDamageData extends DamageData {
    power: DarkHeresyItem;

    constructor() {
        super();
        this.template = 'systems/dark-heresy-2nd/templates/chat/weapon-roll-chat.hbs';
    }
}

export function scatterDirection() {
    let direction = '';
    const directionInt = Math.floor(Math.random() * 10) + 1;
    if (directionInt === 1) direction = 'north west';
    if (directionInt === 2) direction = 'north';
    if (directionInt === 3) direction = 'north east';
    if (directionInt === 4) direction = 'west';
    if (directionInt === 5) direction = 'east';
    if (directionInt === 6 || directionInt === 7) direction = 'south west';
    if (directionInt === 8) direction = 'south';
    if (directionInt === 9 || directionInt === 10) direction = 'south east';
    return direction;
}
