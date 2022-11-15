import { rollDifficulties } from '../rules/difficulties.mjs';
import { aimModifiers } from '../rules/aim.mjs';
import { calculatePsychicPowerRange, calculateWeaponRange } from '../rules/range.mjs';
import { calculateCombatActionModifier, updateAvailableCombatActions } from '../rules/combat-actions.mjs';
import { calculateAttackSpecialModifiers } from '../rules/attack-specials.mjs';
import { calculateAmmoUsed } from '../rules/ammo.mjs';

export class RollData {
    template = '';
    difficulties = rollDifficulties();
    aims = aimModifiers();

    sourceActor;
    targetActor;

    maxRange = 0;
    distance = 0;
    rangeName = '';
    rangeBonus = 0;

    actions = {};
    action = '';
    baseTarget = 0;

    baseChar = '';
    baseAim = 0;
    modifiers = {
        difficulty: 0,
        modifier: 0,
        aim: 0,
    };
    specialModifiers = {};
    modifierTotal = 0;

    roll;
    render;
    previousRolls = [];

    automatic = false;
    success = false;
    dos = 0;
    dof = 0;

    get modifiedTarget() {
        return this.baseTarget + this.modifierTotal;
    }

    get activeModifiers() {
        const modifiers = {};
        for (const m of Object.keys(this.modifiers)) {
            if (this.modifiers[m] !== 0) {
                modifiers[m.toUpperCase()] = this.modifiers[m];
            }
        }
        return modifiers;
    }
}

export class SimpleRollData extends RollData {
    name = '';
    type = '';

    constructor() {
        super();
        this.template = 'systems/dark-heresy-2nd/templates/chat/simple-roll-chat.hbs';
    }
}

export class WeaponRollData extends RollData {
    weapons = [];
    weapon;
    weaponSelect = false;
    ammoUsed = 0;
    weaponModifiers = {};

    constructor() {
        super();
        this.template = 'systems/dark-heresy-2nd/templates/chat/weapon-roll-chat.hbs';
    }

    update() {
        updateAvailableCombatActions(this);
        calculateCombatActionModifier(this);
        this.updateBaseTarget();
    }

    initialize() {
        this.baseTarget = 0;
        this.modifiers['attack'] = 0;
        this.modifiers['difficulty'] = 0;
        this.modifiers['aim'] = 0;
        this.modifiers['modifier'] = 0;


        this.weaponSelect = this.weapons.length > 1;
        this.weapon = this.weapons[0];
        this.weapon.isSelected = true;
    }

    selectWeapon(weaponName) {
        // Unselect All
        this.weapons.filter((weapon) => weapon.id !== weaponName).forEach((weapon) => (weapon.isSelected = false));
        this.weapon = this.data.weapons.find((weapon) => weapon.id === weaponName);
        this.weapon.isSelected = true;
    }

    updateBaseTarget() {
        if (this.weapon.isRanged) {
            this.baseTarget = this.sourceActor?.characteristics?.ballisticSkill?.total ?? 0;
            this.baseChar = 'BS';
        } else {
            this.baseTarget = this.sourceActor?.characteristics?.weaponSkill?.total ?? 0;
            this.baseChar = 'WS';
        }
    }

    async finalize() {
        calculateAmmoUsed(this);
        await calculateAttackSpecialModifiers(this);
        this.modifiers = {...this.modifiers, ...this.specialModifiers};
    }
}

export class PsychicRollData extends RollData {
    psychicPowers = [];
    power;
    powerSelect = false;
    hasFocus = false;

    maxPr = 0;
    pr = 0;

    constructor() {
        super();
        this.template = 'systems/dark-heresy-2nd/templates/chat/psychic-power-roll-chat.hbs';
    }

    initialize() {
        this.baseTarget = 0;
        this.modifiers['bonus'] = 0;
        this.modifiers['difficulty'] = 0;
        this.modifiers['modifier'] = 0;
        this.pr = this.sourceActor.psy.rating ?? 0;
        this.hasFocus = !!this.sourceActor.psy.hasFocus;

        this.powerSelect = this.psychicPowers.length > 1;
        this.power = this.psychicPowers[0];
        this.power.isSelected = true;
    }

    selectPower(powerName) {
        this.psychicPowers.filter((power) => power.id !== powerName).forEach((power) => (power.isSelected = false));
        this.power = this.psychicPowers.find((power) => power.id === powerName);
        this.power.isSelected = true;
    }

    async update() {
        this.modifiers['bonus'] = 10 * Math.floor(this.sourceActor.psy.rating - this.pr);
        this.modifiers['focus'] = this.hasFocus ? 10 : 0;
        this.modifiers['power'] = this.power.system.target.bonus ?? 0;

        this.updateBaseTarget();
        await calculatePsychicPowerRange(this.data);
    }

    updateBaseTarget() {
        const characteristic = this.power.system.target.characteristic;
        const actorCharacteristic = this.sourceActor.getCharacteristicFuzzy(characteristic);
        this.baseTarget = actorCharacteristic.total;
        this.baseChar = actorCharacteristic.short;
    }
}
