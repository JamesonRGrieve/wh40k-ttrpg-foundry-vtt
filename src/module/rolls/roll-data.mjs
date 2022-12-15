import { rollDifficulties } from '../rules/difficulties.mjs';
import { aimModifiers } from '../rules/aim.mjs';
import { calculatePsychicPowerRange, calculateWeaponRange } from '../rules/range.mjs';
import { calculateCombatActionModifier, updateAvailableCombatActions } from '../rules/combat-actions.mjs';
import { calculateAttackSpecialAttackBonuses, updateAttackSpecials } from '../rules/attack-specials.mjs';
import { calculateAmmoAttackBonuses, calculateAmmoInformation } from '../rules/ammo.mjs';
import { calculateWeaponModifiersAttackBonuses, updateWeaponModifiers } from '../rules/weapon-modifiers.mjs';
import { hitDropdown } from '../rules/hit-locations.mjs';
import { DarkHeresy } from '../rules/config.mjs';

export class RollData {
    difficulties = rollDifficulties();
    aims = aimModifiers();
    locations = hitDropdown();
    lasModes = DarkHeresy.combat.las_fire_modes;

    // Chat Controls
    ignoreModifiers = false;
    ignoreDegrees = false;
    ignoreSuccess = false;
    ignoreControls = false;
    ignoreDamage = false;

    sourceActor;
    targetActor;

    maxRange = 0;
    distance = 0;
    rangeName = '';
    rangeBonus = 0;

    combatActionInformation = {};
    actions = {};
    action = '';

    baseTarget = 0;
    baseChar = '';

    isOpposed = false;
    opposedTarget = 0;
    opposedChar = '';
    opposedSuccess = false;
    opposedDof = 0;
    opposedDos = 0;
    opposedRoll;

    baseAim = 0;
    modifiers = {
        difficulty: 0,
        modifier: 0,
        aim: 0,
    };
    specialModifiers = {};
    modifierTotal = 0;
    hasEyeOfVengeanceAvailable = false;
    eyeOfVengeance = false;

    attackSpecials = [];
    roll;
    render;
    previousRolls = [];
    automatic = false;
    success = false;
    dos = 0;
    dof = 0;

    get showDamage() {
        return this.success || this.isThrown;
    }

    reset() {
        this.automatic = false;
        this.success = false;
        this.opposedSuccess = false;
    }

    nameOverride;
    get name() {
        if(this.nameOverride) return this.nameOverride;

        let actionItem = this.weapon ?? this.power;
        if (actionItem) return actionItem.name;

        return '';
    }

    get effectString() {
        let actionItem = this.weapon ?? this.power;
        if(!actionItem) return '';

        const str = [];

        const ammo = actionItem.items.find((i) => i.isAmmunition);
        if (ammo) {
            str.push(ammo.name)
        }

        const specials = this.attackSpecials.map(s => s.name).join(',')
        if(specials) {
            str.push(specials);
        }

        if(this.hasWeaponModification) {
            const mods = this.weaponModifications.map(m => m.name).join(',');
            if(mods) {
                str.push(mods);
            }
        }
        return str.join(' | ');
    }

    get modifiedTarget() {
        return this.baseTarget + this.modifierTotal;
    }

    get activeModifiers() {
        const modifiers = {};
        for (const m of Object.keys(this.modifiers)) {
            try {
                const value = Number.parseInt(this.modifiers[m]);
                if (value !== 0) {
                    console.log(`Modifier ${m.toUpperCase()} value ${value}`, value !== 0);
                    modifiers[m.toUpperCase()] = value;
                }
            } catch (err) {
                game.dh.error('Error while calculate roll data modifiers:', err);
            }
        }
        return modifiers;
    }

    hasAttackSpecial(special) {
        return !!this.attackSpecials.find((s) => s.name === special);
    }

    getAttackSpecial(special) {
        return this.attackSpecials.find((s) => s.name === special);
    }

    modifiersToRollData() {
        let formula = '0 ';
        const rollParams = {};
        for (const modifier of Object.keys(this.modifiers)) {
            if (this.modifiers[modifier] !== 0) {
                if (this.modifiers[modifier] >= 0) {
                    formula += ` + @${modifier}`;
                } else {
                    formula += ` - @${modifier}`;
                }
                rollParams[modifier] = Math.abs(this.modifiers[modifier]);
            }
        }
        return {
            formula: formula,
            params: rollParams,
        };
    }

    async calculateTotalModifiers() {
        const rollDetails = this.modifiersToRollData();
        try {
            const roll = new Roll(rollDetails.formula, rollDetails.params);
            await roll.evaluate({ async: true });
            if (roll.total > 60) {
                this.modifierTotal = 60;
            } else if (roll.total < -60) {
                this.modifierTotal = -60;
            } else {
                this.modifierTotal = roll.total;
            }
        } catch (error) {
            this.modifierTotal = 0;
        }
    }
}

export class WeaponRollData extends RollData {
    weapons = [];
    weapon;
    weaponSelect = false;

    weaponModifications = [];
    isCalledShot = false;
    calledShotLocation;
    usesAmmo = false;
    ammoText = '';
    ammoPerShot = 1;
    fireRate = 1;
    ammoUsed = 0;
    weaponModifiers = {};

    canAim = true;
    isKnockDown = false;
    isFeint = false;
    isStun = false;
    isThrown = false;
    isSpray = false;
    isLasWeapon = false;
    lasMode = 'Standard';

    constructor() {
        super();
        this.template = 'systems/dark-heresy-2nd/templates/chat/action-roll-chat.hbs';
    }

    hasWeaponModification(special) {
        return !!this.weaponModifications.find((s) => s.name === special);
    }

    getWeaponModification(special) {
        return this.weaponModifications.find((s) => s.name === special);
    }

    async update() {
        if(this.weapon.system.attackBonus) {
            this.modifiers['weapon'] = this.weapon.system.attackBonus;
        }
        this.canAim = this.action !== 'All Out Attack';
        this.isLasWeapon = this.weapon.system.type === 'Las';
        this.isSpray = this.hasAttackSpecial('Spray');
        this.isStun = this.action === 'Stun';
        this.isFeint = this.action === 'Feint';
        this.isKnockDown = this.action === 'Knock Down';

        this.ignoreModifiers = this.isSpray || this.isStun;
        this.ignoreDegrees = this.isSpray || this.isStun;
        this.ignoreSuccess = this.isSpray;
        this.ignoreControls = this.isFeint || this.isStun || this.isKnockDown;
        this.ignoreDamage = this.isStun || this.isFeint || this.isKnockDown;
        this.isThrown = this.weapon.isThrown;

        this.isOpposed = this.isKnockDown || this.isFeint;
        if(this.isOpposed && this.targetActor) {
            if(this.isFeint) {
                this.opposedTarget = this.targetActor?.characteristics?.weaponSkill?.total ?? 0;
                this.opposedChar = 'WS';
            } else if (this.isKnockDown) {
                this.opposedTarget = this.targetActor?.characteristics?.strength?.total ?? 0;
                this.opposedChar = 'S';
            }
        }

        await updateWeaponModifiers(this);
        await updateAttackSpecials(this);
        updateAvailableCombatActions(this);
        calculateCombatActionModifier(this);
        if (this.weapon.usesAmmo) {
            this.usesAmmo = true;
            calculateAmmoInformation(this);
        } else {
            this.usesAmmo = false;
        }
        await calculateWeaponRange(this);
        this.updateBaseTarget();
    }

    initialize() {
        this.baseTarget = 0;
        this.modifiers['attack'] = 0;
        this.modifiers['difficulty'] = 0;
        this.modifiers['aim'] = 0;
        this.modifiers['modifier'] = 0;

        // Size Bonus should not change after initial targeting
        if(this.targetActor && this.targetActor.system.size) {
            try {
                const size = Number.parseInt(this.targetActor.system.size);
                this.modifiers['target-size'] = (size - 4) * 10;
            } catch (error) {
                ui.notifications.warn('Target size is not a number. Unexpected error.');
            }
        }

        // Talents
        if(this.sourceActor.hasTalent('Eye of Vengeance') && this.sourceActor.system.fate.value > 0) {
            this.hasEyeOfVengeanceAvailable = true;
        }

        this.weaponSelect = this.weapons.length > 1;
        this.weapon = this.weapons[0];
        this.weapon.isSelected = true;
    }

    selectWeapon(weaponName) {
        // Unselect All
        this.weapons.filter((weapon) => weapon.id !== weaponName).forEach((weapon) => (weapon.isSelected = false));
        this.weapon = this.weapons.find((weapon) => weapon.id === weaponName);
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

        if (this.action === 'Knock Down') {
            this.baseTarget = this.sourceActor?.characteristics?.strength?.total ?? 0;
            this.baseChar = 'S';
        }
    }

    async finalize() {
        // Remove Aim Modifier for All out attack in the case
        // where aim was selected and then the attack changed
        if(this.action === 'All Out Attack') {
            this.modifiers['aim'] = 0;
        }

        await calculateAmmoAttackBonuses(this);
        await calculateAttackSpecialAttackBonuses(this);
        await calculateWeaponModifiersAttackBonuses(this);
        this.modifiers = {
            ...this.modifiers,
            ...this.specialModifiers,
            ...this.weaponModifiers,
            range: this.rangeBonus,
        };

        // Unselect Weapon -- UI issues if it's selected on start
        this.weapon.isSelected = false;

        // Suppressing Fire ignores other modifiers
        if (this.action.includes('Suppressing Fire')) {
            this.modifiers = {
                'attack': -20
            }
        }

        await this.calculateTotalModifiers();
    }
}

export class PsychicRollData extends RollData {
    psychicPowers = [];
    power;
    powerSelect = false;
    hasFocus = false;

    hasDamage = false;

    maxPr = 0;
    pr = 0;

    constructor() {
        super();
        this.template = 'systems/dark-heresy-2nd/templates/chat/action-roll-chat.hbs';
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
        this.hasDamage = this.power.system.subtype.includes('Attack');
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
        this.hasDamage = this.power.system.subtype.includes('Attack');
        await updateAttackSpecials(this);
        this.updateBaseTarget();
        await calculatePsychicPowerRange(this);
    }

    updateBaseTarget() {
        const target = this.power.system.target;
        if(!target) return;

        if(target.useSkill) {
            const skill = target.skill;
            const actorSkill = this.sourceActor.getSkillFuzzy(skill);
            this.baseTarget = actorSkill.current;
            this.baseChar = actorSkill.label;
        } else {
            const characteristic = target.characteristic;
            const actorCharacteristic = this.sourceActor.getCharacteristicFuzzy(characteristic);
            this.baseTarget = actorCharacteristic.total;
            this.baseChar = actorCharacteristic.short;
        }

        if(target.isOpposed && this.targetActor) {
            this.isOpposed = true;

            if(target.useOpposedSkill) {
                const skill = target.opposedSkill;
                const actorSkill = this.targetActor.getSkillFuzzy(skill);
                this.opposedTarget = actorSkill.current;
                this.opposedChar = actorSkill.label;
            } else {
                const characteristic = target.opposed;
                const actorCharacteristic = this.targetActor.getCharacteristicFuzzy(characteristic);
                this.opposedTarget = actorCharacteristic.total;
                this.opposedChar = actorCharacteristic.short;
            }
        }
    }

    async finalize() {
        await calculateAttackSpecialAttackBonuses(this);
        this.modifiers = { ...this.modifiers, ...this.specialModifiers };
        await this.calculateTotalModifiers();
    }
}
