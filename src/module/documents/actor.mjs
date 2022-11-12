import { homeworlds } from '../rules/homeworlds.mjs';
import { backgrounds } from '../rules/backgrounds.mjs';
import { divinations } from '../rules/divinations.mjs';
import { roles } from '../rules/roles.mjs';
import { eliteAdvances } from '../rules/elite-advances.mjs';
import { fieldMatch } from '../rules/config.mjs';
import { prepareSimpleRoll } from '../rolls/simple-prompt.mjs';
import { prepareWeaponRoll } from '../rolls/weapon-prompt.mjs';
import { DHAttackManager } from '../actions/attack-manager.mjs';

export class DarkHeresyActor extends Actor {
    get backpack() {
        return this.system.backpack;
    }

    get characteristics() {
        return this.system.characteristics;
    }

    get skills() {
        return this.system.skills;
    }

    get initiative() {
        return this.system.initiative;
    }

    get wounds() {
        return this.system.wounds;
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

    get size() {
        return this.system.size;
    }

    get faction() {
        return this.system.faction;
    }

    get subfaction() {
        return this.system.subfaction;
    }

    get subtype() {
        return this.system.type;
    }

    get threatLevel() {
        return this.system.threatLevel;
    }

    get armour() {
        return this.system.armour;
    }

    get encumbrance() {
        return this.system.encumbrance;
    }

    get movement() {
        return this.system.movement;
    }

    get backgroundEffects() {
        return this.system.backgroundEffects;
    }

    prepareData() {
        super.prepareData();
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
    }

    async rollWeaponAttack(weapon) {
        if (!weapon.system.equipped) {
            ui.notifications.warn('Actor must have weapon equipped!');
            return;
        }
        await DHAttackManager.performWeaponAttack(weapon, null, weapon);
    }

    async rollSkill(skillName, specialityName) {
        let skill = this.skills[skillName];
        let label = skill.label;
        if (specialityName) {
            skill = skill.specialities[specialityName];
            label = `${label}: ${skill.label}`;
        }
        await prepareSimpleRoll({
            sheetName: this.name,
            name: label,
            type: 'Skill',
            baseTarget: skill.current,
            modifier: 0,
        });
    }

    async rollCharacteristic(characteristicName) {
        const characteristic = this.characteristics[characteristicName];
        await prepareSimpleRoll({
            sheetName: this.name,
            name: characteristic.label,
            type: 'Characteristic',
            baseTarget: characteristic.total,
            modifier: 0,
        });
    }

    async rollItem(itemId) {
        const item = this.items.get(itemId);
        switch (item.type) {
            case 'weapon':
                await this.rollWeaponAttack(item);
                return;
            case 'psychic-power':
                await DHAttackManager.performPsychicAttack(this, null, item);
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
        this.experience.totalSpent =
            this.experience.spentCharacteristics + this.experience.spentSkills + this.experience.spentTalents + this.experience.spentPsychicPowers;
        this.experience.total = this.experience.value + this.experience.totalSpent;
    }

    _computeArmour() {
        let locations = game.system.template.Item.templates.armourPoints.armourPoints;
        let toughness = this.characteristics.toughness;

        this.system.armour = Object.keys(locations).reduce(
            (accumulator, location) =>
                Object.assign(accumulator, {
                    [location]: {
                        total: toughness.bonus,
                        toughnessBonus: toughness.bonus,
                        value: 0,
                    },
                }),
            {},
        );

        // object for storing the max armour
        let maxArmour = Object.keys(locations).reduce((acc, location) => Object.assign(acc, { [location]: 0 }), {});

        // for each item, find the maximum armour val per location
        this.items
            .filter((item) => item.type === 'armour')
            .filter((item) => item.system.equipped)
            .reduce((acc, armour) => {
                Object.keys(locations).forEach((location) => {
                    let armourVal = armour.system.armourPoints[location] || 0;
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

    _computeMovement() {
        let agility = this.characteristics.agility;
        let size = this.size;
        this.system.movement = {
            half: agility.bonus + size - 4,
            full: (agility.bonus + size - 4) * 2,
            charge: (agility.bonus + size - 4) * 3,
            run: (agility.bonus + size - 4) * 6,
        };
    }

    _findCharacteristic(short) {
        for (let characteristic of Object.values(this.characteristics)) {
            if (characteristic.short === short) {
                return characteristic;
            }
        }
        return { total: 0 };
    }

    _computeEncumbrance() {
        // Current Weight
        let currentWeight = 0;

        // Backpack
        let backpackCurrentWeight = 0;
        let backpackMaxWeight = 0;
        if (this.backpack.hasBackpack) {
            backpackMaxWeight = this.backpack.weight.max;
            this.items.forEach((item) => {
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
            this.items.forEach((item) => (currentWeight += item.totalWeight));
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
        return !!this.items
            .filter(i => i.type === 'talent')
            .find(t => t.name === talent);
    }
}
