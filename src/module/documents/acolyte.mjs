import { homeworlds } from '../rules/homeworlds.mjs';
import { backgrounds } from '../rules/backgrounds.mjs';
import { divinations } from '../rules/divinations.mjs';
import { roles } from '../rules/roles.mjs';
import { eliteAdvances } from '../rules/elite-advances.mjs';
import { fieldMatch } from '../rules/config.mjs';
import { prepareSimpleRoll } from '../prompts/simple-prompt.mjs';
import { DHTargetedActionManager } from '../actions/targeted-action-manager.mjs';
import { prepareDamageRoll } from '../prompts/damage-prompt.mjs';
import { SimpleSkillData } from '../rolls/action-data.mjs';
import { DarkHeresyBaseActor } from './base-actor.mjs';
import { ForceFieldData } from '../rolls/force-field-data.mjs';
import { prepareForceFieldRoll } from '../prompts/force-field-prompt.mjs';
import { DHBasicActionManager } from '../actions/basic-action-manager.mjs';
import { getDegree, roll1d100 } from '../rolls/roll-helpers.mjs';
import { SYSTEM_ID } from '../hooks-manager.mjs';
import { DarkHeresySettings } from '../dark-heresy-settings.mjs';

export class DarkHeresyAcolyte extends DarkHeresyBaseActor {

    get backpack() {
        return this.system.backpack;
    }

    get skills() {
        return this.system.skills;
    }

    get fatigue() {
        return this.system.fatigue;
    }

    get fate() {
        return this.system.fate;
    }

    get psy() {
        return this.system.psy;
    }

    get bio() {
        return this.system.bio;
    }

    get experience() {
        return this.system.experience;
    }

    get insanity() {
        return this.system.insanity;
    }

    get corruption() {
        return this.system.corruption;
    }

    get aptitudes() {
        return this.system.aptitudes;
    }

    get armour() {
        return this.system.armour;
    }

    get encumbrance() {
        return this.system.encumbrance;
    }

    get backgroundEffects() {
        return this.system.backgroundEffects;
    }

    async prepareData() {
        this.system.backgroundEffects = {
            abilities: [],
        };
        this._computeBackgroundFields();
        this._computeCharacteristics();
        this._computeSkills();
        this._computeExperience();
        this._computeArmour();
        this._computeMovement();
        this._computeEncumbrance();
        await super.prepareData();
    }

    async rollWeaponDamage(weapon) {
        if (!weapon.system.equipped) {
            ui.notifications.warn('Actor must have weapon equipped!');
            return;
        }
        await prepareDamageRoll({
            name: weapon.name,
            damage: weapon.system.damage,
            damageType: weapon.system.damageType,
            penetration: weapon.system.penetration,
            targetActor: () => {
                const targetedObjects = game.user.targets;
                if (targetedObjects && targetedObjects.size > 0) {
                    const target = targetedObjects.values().next().value;
                    return target.actor;
                }
            }
        });
    }

    async rollPsychicPowerDamage(power) {
        await prepareDamageRoll({
            psychicPower: true,
            pr: this.psy.currentRating,
            name: power.name,
            damage: power.system.damage,
            damageType: power.system.damageType,
            penetration: power.system.penetration,
        });
    }

    async rollSkill(skillName, specialityName) {
        let skill = this.skills[skillName];
        let label = skill.label;
        if (specialityName) {
            skill = skill.specialities[specialityName];
            label = `${label}: ${skill.label}`;
        }
        const simpleSkillData = new SimpleSkillData();
        const rollData = simpleSkillData.rollData;
        rollData.actor = this;
        rollData.nameOverride = label;
        rollData.type = 'Skill';
        rollData.baseTarget = skill.current;
        rollData.modifiers.modifier = 0;
        await prepareSimpleRoll(simpleSkillData);
    }

    async rollItem(itemId) {
        game.dh.log('RollItem', itemId);
        const item = this.items.get(itemId);
        switch (item.type) {
            case 'weapon':
                if (!item.system.equipped) {
                    ui.notifications.warn('Actor must have weapon equipped!');
                    return;
                }
                if(game.settings.get(SYSTEM_ID, DarkHeresySettings.SETTINGS.simpleAttackRolls)) {
                    if(item.isRanged) {
                        await this.rollCharacteristic('ballisticSkill', item.name);
                    } else {
                        await this.rollCharacteristic('weaponSkill',  item.name);
                    }
                } else {
                    await DHTargetedActionManager.performWeaponAttack(this, null, item);
                }
                return;
            case 'psychicPower':
                if(game.settings.get(SYSTEM_ID, DarkHeresySettings.SETTINGS.simplePsychicRolls)) {
                    await this.rollCharacteristic('willpower',  item.name)
                } else {
                    await DHTargetedActionManager.performPsychicAttack(this, null, item);
                }
                return;
            case 'forceField':
                if (!item.system.equipped || !item.system.activated) {
                    ui.notifications.warn('Actor must have force field equipped and activated!');
                    return;
                }
                await prepareForceFieldRoll(new ForceFieldData(this, item));
                return;
            default:
                await DHBasicActionManager.sendItemVocalizeChat({
                    actor: this.name,
                    name: item.name,
                    type: item.type?.toUpperCase(),
                    description: await TextEditor.enrichHTML(item.system.benefit ?? item.system.description, {
                        rollData: {
                            actor: this,
                            item: item,
                            pr: this.psy.rating
                        }
                    }),
                });
        }
    }

    async damageItem(itemId) {
        const item = this.items.get(itemId);
        switch (item.type) {
            case 'weapon':
                await this.rollWeaponDamage(item);
                return;
            case 'psychicPower':
                await this.rollPsychicPowerDamage(item);
                return;
            default:
                return ui.notifications.warn(`No actions implemented for item type: ${item.type}`);
        }
    }

    _computeBackgroundFields() {
        if (this.bio?.homeWorld) {
            this.backgroundEffects.homeworld = homeworlds().find((h) => h.name === this.bio.homeWorld);
            if (this.backgroundEffects.homeworld) {
                this.backgroundEffects.abilities.push({
                    source: 'Homeworld',
                    ...this.backgroundEffects.homeworld.home_world_bonus,
                });
            }
        }
        if (this.bio?.background) {
            this.backgroundEffects.background = backgrounds().find((h) => h.name === this.bio.background);
            if (this.backgroundEffects.background) {
                this.backgroundEffects.abilities.push({
                    source: 'Background',
                    ...this.backgroundEffects.background.background_bonus,
                });
            }
        }
        if (this.bio?.role) {
            this.backgroundEffects.role = roles().find((h) => h.name === this.bio.role);
            if (this.backgroundEffects.role) {
                this.backgroundEffects.abilities.push({
                    source: 'Role',
                    ...this.backgroundEffects.role.role_bonus,
                });
            }
        }
        if (this.bio?.divination) {
            this.backgroundEffects.divination = divinations().find((h) => h.name === this.bio.divination);
            if (this.backgroundEffects.divination) {
                this.backgroundEffects.abilities.push({
                    source: 'Divination',
                    name: this.backgroundEffects.divination.name,
                    benefit: this.backgroundEffects.divination.effect,
                });
            }
        }
        if (this.bio?.elite) {
            this.backgroundEffects.eliteAdvance = eliteAdvances().find((h) => h.name === this.bio.elite);
        }
    }

    _computeCharacteristics() {
        for (const [name, characteristic] of Object.entries(this.characteristics)) {
            characteristic.total = characteristic.base + characteristic.advance * 5 + characteristic.modifier;
            characteristic.bonus = Math.floor(characteristic.total / 10) + characteristic.unnatural;

            // Homeworld Bonus or Negative
            if (this.backgroundEffects.homeworld) {
                if (this.backgroundEffects.homeworld.bonus_characteristics.some((c) => fieldMatch(c, name))) {
                    characteristic.has_bonus = true;
                } else if (fieldMatch(this.backgroundEffects.homeworld.negative_characteristic, name)) {
                    characteristic.has_negative = true;
                }
            }

            if (this.fatigue.value > characteristic.bonus) {
                characteristic.total = Math.ceil(characteristic.total / 2);
                characteristic.bonus = Math.floor(characteristic.total / 10) + characteristic.unnatural;
            }
        }

        this.system.insanityBonus = Math.floor(this.insanity / 10);
        this.system.corruptionBonus = Math.floor(this.corruption / 10);
        this.psy.currentRating = this.psy.rating - this.psy.sustained;
        this.initiative.bonus = this.characteristics[this.initiative.characteristic].bonus;
        this.fatigue.max = this.characteristics.toughness.bonus + this.characteristics.willpower.bonus;
    }

    _computeSkills() {
        for (let skill of Object.values(this.skills)) {
            let short = !skill.characteristic || skill.characteristic === '' ? skill.characteristics[0] : skill.characteristic;
            let characteristic = this._findCharacteristic(short);
            skill.current = characteristic.total + this._skillAdvanceToValue(skill.advance);

            if (skill.isSpecialist) {
                for (let speciality of Object.values(skill.specialities)) {
                    speciality.current = characteristic.total + this._skillAdvanceToValue(speciality.advance);
                }
            }
        }
    }

    getSkillFuzzy(skillName) {
        for (const [name, skill] of Object.entries(this.skills)) {
            if (skillName.toUpperCase() === name.toUpperCase()) {
                return skill;
            }
        }
    }

    _skillAdvanceToValue(adv) {
        let advance = 1 * adv;
        let training = -20;
        if (advance === 1) {
            training = 0;
        } else if (advance === 2) {
            training = 10;
        } else if (advance === 3) {
            training = 20;
        } else if (advance >= 4) {
            training = 30;
        }
        return training;
    }

    _computeExperience() {
        if(!this.experience) return;
        this.experience.spentCharacteristics = 0;
        this.experience.spentSkills = 0;
        this.experience.spentTalents = 0;
        this.experience.spentPsychicPowers = this.psy.cost;
        for (let characteristic of Object.values(this.characteristics)) {
            this.experience.spentCharacteristics += parseInt(characteristic.cost, 10);
        }
        for (let skill of Object.values(this.skills)) {
            if (skill.isSpecialist) {
                for (let speciality of Object.values(skill.specialities)) {
                    this.experience.spentSkills += parseInt(speciality.cost, 10);
                }
            } else {
                this.experience.spentSkills += parseInt(skill.cost, 10);
            }
        }
        for (let item of this.items) {
            if (item.isTalent) {
                this.experience.spentTalents += parseInt(item.cost, 10);
            } else if (item.isPsychicPower) {
                this.experience.spentPsychicPowers += parseInt(item.cost, 10);
            }
        }
        this.experience.calculatedTotal =
            this.experience.spentCharacteristics + this.experience.spentSkills + this.experience.spentTalents + this.experience.spentPsychicPowers;
        this.experience.available = this.experience.total - this.experience.used;
    }

    _computeArmour() {
        let locations = game.system.template.Item.templates.armourPoints.armourPoints;
        let toughness = this.characteristics.toughness;
        let traitBonus = 0;

        // Compute Top Trait Bonus
        const traits = this.items.filter((item) => item.type === 'trait');
        for (const trait of traits) {
            switch(trait.name) {
                case 'Machine':
                    if(trait.system.level > traitBonus) {
                        traitBonus = trait.system.level;
                    }
                    break;
                case 'Natural Armor':
                    if(trait.system.level > traitBonus) {
                        traitBonus = trait.system.level;
                    }
                    break;
            }
        }

        // Create Basic Armour Point Object
        this.system.armour = Object.keys(locations).reduce(
            (accumulator, location) =>
                Object.assign(accumulator, {
                    [location]: {
                        total: toughness.bonus + traitBonus,
                        toughnessBonus: toughness.bonus,
                        traitBonus: traitBonus,
                        value: 0,
                    },
                }),
            {},
        );

        // Add Cybernetics -- these are cumulative?
        this.items
            .filter((item) => item.type === 'cybernetic' )
            .filter((item) => item.system.equipped)
            .filter((item) => item.system.hasArmourPoints)
            .forEach((cybernetic) => {
                Object.keys(locations).forEach((location) => {
                    let armourVal = cybernetic.system.armourPoints[location] || 0;
                    this.armour[location].total += Number(armourVal);
                });
            });

        // object for storing the max armour
        let maxArmour = Object.keys(locations).reduce((acc, location) => Object.assign(acc, { [location]: 0 }), {});

        // for each item, find the maximum armour val per location
        this.items
            .filter((item) => item.type === 'armour' )
            .filter((item) => item.system.equipped)
            .reduce((acc, armour) => {
                Object.keys(locations).forEach((location) => {
                    let armourVal = armour.system.armourPoints[location] || 0;
                    // Coerce -- sometimes this is a string??
                    armourVal = Number(armourVal);
                    if (armourVal > acc[location]) {
                        acc[location] = armourVal;
                    }
                });
                return acc;
            }, maxArmour);

        this.armour.head.value = maxArmour['head'];
        this.armour.leftArm.value = maxArmour['leftArm'];
        this.armour.rightArm.value = maxArmour['rightArm'];
        this.armour.body.value = maxArmour['body'];
        this.armour.leftLeg.value = maxArmour['leftLeg'];
        this.armour.rightLeg.value = maxArmour['rightLeg'];

        this.armour.head.total += this.armour.head.value;
        this.armour.leftArm.total += this.armour.leftArm.value;
        this.armour.rightArm.total += this.armour.rightArm.value;
        this.armour.body.total += this.armour.body.value;
        this.armour.leftLeg.total += this.armour.leftLeg.value;
        this.armour.rightLeg.total += this.armour.rightLeg.value;
    }

    _computeEncumbrance() {
        // Current Weight
        let currentWeight = 0;

        // Backpack
        let backpackCurrentWeight = 0;
        let backpackMaxWeight = 0;
        if (this.backpack.hasBackpack) {
            backpackMaxWeight = this.backpack.weight.max;
            this.items.filter((item) => !item.isStorageLocation).forEach((item) => {
                if (item.system.backpack?.inBackpack) {
                    backpackCurrentWeight += item.totalWeight;
                } else {
                    currentWeight += item.totalWeight;
                }
            });

            if (this.backpack.isCombatVest) {
                currentWeight += backpackCurrentWeight;
            }
        } else {
            // No backpack -- add everything
            this.items.filter((item) => !item.isStorageLocation).forEach((item) => (currentWeight += item.totalWeight));
        }

        const attributeBonus = this.characteristics.strength.bonus + this.characteristics.toughness.bonus;
        this.system.encumbrance = {
            max: 0,
            value: currentWeight,
            encumbered: false,
            backpack_max: backpackMaxWeight,
            backpack_value: backpackCurrentWeight,
            backpack_encumbered: false,
        };
        switch (attributeBonus) {
            case 0:
                this.encumbrance.max = 0.9;
                break;
            case 1:
                this.encumbrance.max = 2.25;
                break;
            case 2:
                this.encumbrance.max = 4.5;
                break;
            case 3:
                this.encumbrance.max = 9;
                break;
            case 4:
                this.encumbrance.max = 18;
                break;
            case 5:
                this.encumbrance.max = 27;
                break;
            case 6:
                this.encumbrance.max = 36;
                break;
            case 7:
                this.encumbrance.max = 45;
                break;
            case 8:
                this.encumbrance.max = 56;
                break;
            case 9:
                this.encumbrance.max = 67;
                break;
            case 10:
                this.encumbrance.max = 78;
                break;
            case 11:
                this.encumbrance.max = 90;
                break;
            case 12:
                this.encumbrance.max = 112;
                break;
            case 13:
                this.encumbrance.max = 225;
                break;
            case 14:
                this.encumbrance.max = 337;
                break;
            case 15:
                this.encumbrance.max = 450;
                break;
            case 16:
                this.encumbrance.max = 675;
                break;
            case 17:
                this.encumbrance.max = 900;
                break;
            case 18:
                this.encumbrance.max = 1350;
                break;
            case 19:
                this.encumbrance.max = 1800;
                break;
            case 20:
                this.encumbrance.max = 2250;
                break;
            default:
                this.encumbrance.max = 2250;
                break;
        }

        if (this.encumbrance.value > this.encumbrance.max) {
            this.encumbrance.encumbered = true;
        }
        if (this.encumbrance.backpack_value > this.encumbrance.backpack_max) {
            this.encumbrance.backpack_encumbered = true;
        }
    }

    hasTalent(talent) {
        return !!this.items.filter((i) => i.type === 'talent').find((t) => t.name === talent);
    }

    hasTalentFuzzyWords(words) {
        return !!this.items.filter((i) => i.type === 'talent').find((t) => {
            for(const word of words) {
                if (!t.name.includes(word)) return false;
            }
            return true;
        });
    }

    async spendFate() {
        await this.update({
            system: {
                fate: {
                    value: this.system.fate.value - 1
                }
            }
        });
    }

    async rollCharacteristicCheck(characteristic) {
        const char = this.getCharacteristicFuzzy(characteristic);
        if(!char) {
            game.dh.error('Unable to perform characteristic test. Could now find provided characteristic.', char);
            return null;
        }
        return await this.rollCheck(char.total);
    }

    async opposedCharacteristicTest(targetActor, characteristic) {
        const sourceRoll = await this.rollCharacteristicCheck(characteristic);
        const targetRoll = targetActor ? await targetActor.rollCharacteristicCheck(characteristic) : null;
        return await this.opposedTest(sourceRoll, targetRoll);
    }

    async rollCheck(targetNumber) {
        const roll = await roll1d100();
        const success = roll.total === 1 || (roll.total <= targetNumber && roll.total !== 100);
        let dos = 0;
        let dof = 0;

        if(success) {
            dos = 1 + getDegree(targetNumber, roll.total);
        } else {
            dof = 1 + getDegree(roll.total, targetNumber);
        }

        return {
            roll: roll,
            target: targetNumber,
            success: success,
            dos: dos,
            dof: dof
        }
    }

    async opposedTest(rollCheckSource, rollCheckTarget) {
        if(!rollCheckSource) {
            return null;
        }
        if(rollCheckTarget) {
            let success = false;
            if(rollCheckSource.success) {
                if(!rollCheckTarget.success) {
                    success = true;
                } else {
                    success = rollCheckSource.dos >= rollCheckTarget.dos;
                }
            }
            return {
                source: rollCheckSource,
                target: rollCheckTarget,
                success: success
            }
        } else {
            return {
                source: rollCheckSource,
                success: true
            };
        }
    }
}
