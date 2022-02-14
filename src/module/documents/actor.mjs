import {homeworlds} from "../helpers/homeworlds.mjs";
import {backgrounds} from "../helpers/backgrounds.mjs";
import {divinations} from "../helpers/divinations.mjs";
import {roles} from "../helpers/roles.mjs";
import {eliteAdvances} from "../helpers/elite_advances.mjs";

export class DarkHeresyActor extends Actor {

  prepareData() {
    super.prepareData();
    this._computeBackgroundFields()
    this._computeCharacteristics();
    this._computeSkills();
    this._computeExperience();
    this._computeArmour();
    this._computeMovement();
    this._computeEncumbrance();

  }

  _computeBackgroundFields() {
    if(this.bio.homeWorld) {
      this.data.data.homeworld = homeworlds().find(h => h.name === this.bio.homeWorld)
    }
    if(this.bio.background) {
      this.data.data.background = backgrounds().find(h => h.name === this.bio.background)
    }
    if(this.bio.role) {
      this.data.data.role = roles().find(h => h.name === this.bio.role)
    }
    if(this.bio.divination) {
      this.data.data.divination = divinations().find(h => h.name === this.bio.divination)
    }
    if(this.bio.elite) {
      this.data.data.eliteAdvance = eliteAdvances().find(h => h.name === this.bio.elite)
    }
  }

  _computeCharacteristics() {
    for (let characteristic of Object.values(this.characteristics)) {
      characteristic.total = characteristic.base + (characteristic.advance * 5) + characteristic.modifier;
      characteristic.bonus = Math.floor(characteristic.total / 10) + characteristic.unnatural;
      if(this.fatigue.value > characteristic.bonus) {
        characteristic.total = Math.ceil(characteristic.total / 2);
        characteristic.bonus = Math.floor(characteristic.total / 10) + characteristic.unnatural;
      }
    }

    this.data.data.insanityBonus = Math.floor(this.insanity / 10);
    this.data.data.corruptionBonus = Math.floor(this.corruption / 10);
    this.psy.currentRating = this.psy.rating - this.psy.sustained;
    this.initiative.bonus = this.characteristics[this.initiative.characteristic].bonus;
    this.fatigue.max = this.characteristics.toughness.bonus + this.characteristics.willpower.bonus;
  }

  _computeSkills() {
    for (let skill of Object.values(this.skills)) {
      let short = (!skill.characteristic || skill.characteristic === '') ? skill.characteristics[0] : skill.characteristic;
      let characteristic = this._findCharacteristic(short);
      skill.current = characteristic.total + this._skillAdvanceToValue(skill.advance);

      if(skill.isSpecialist) {
        for(let speciality of Object.values(skill.specialities)) {
          speciality.current = characteristic.total + this._skillAdvanceToValue(speciality.advance);
        }
      }
    }
  }

  _skillAdvanceToValue(adv) {
    let advance = (1 * adv);
    let training = -20
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
    this.experience.totalSpent = this.experience.spentCharacteristics + this.experience.spentSkills + this.experience.spentTalents + this.experience.spentPsychicPowers;
    this.experience.total = this.experience.value + this.experience.totalSpent;
  }


  _computeArmour() {
    let locations = game.system.template.Item.armour.armourPoints;
    let toughness = this.characteristics.toughness;

    this.data.data.armour =
        Object.keys(locations)
            .reduce((accumulator, location) =>
                Object.assign(accumulator,
                    {
                      [location]: {
                        total: toughness.bonus,
                        toughnessBonus: toughness.bonus,
                        value: 0
                      }
                    }), {});

    // object for storing the max armour
    let maxArmour = Object.keys(locations)
        .reduce((acc, location) =>
            Object.assign(acc, { [location]: 0 }), {})

    // for each item, find the maximum armour val per location
    this.items
        .filter(item => item.type === "armour")
        .filter(item => item.data.data.equipped)
        .reduce((acc, armour) => {
          Object.keys(locations)
              .forEach((location) => {
                    let armourVal = armour.data.data.armourPoints[location] || 0;
                    if (armourVal > acc[location]) {
                      acc[location] = armourVal;
                    }
                  }
              )
          return acc;
        }, maxArmour);

    this.armour.head.value = maxArmour["head"];
    this.armour.leftArm.value = maxArmour["leftArm"];
    this.armour.rightArm.value = maxArmour["rightArm"];
    this.armour.body.value = maxArmour["body"];
    this.armour.leftLeg.value = maxArmour["leftLeg"];
    this.armour.rightLeg.value = maxArmour["rightLeg"];

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
    this.data.data.movement = {
      half: agility.bonus + size - 4,
      full: (agility.bonus + size - 4) * 2,
      charge: (agility.bonus  + size - 4) * 3,
      run: (agility.bonus + size - 4) * 6
    }
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
    if(this.backpack.hasBackpack) {
      backpackMaxWeight = this.backpack.weight.max;
      this.items.forEach(item => {
        if(item.data.data.backpack?.inBackpack) {
          backpackCurrentWeight += item.totalWeight;
        } else {
          currentWeight += item.totalWeight;
        }
      });

      if(this.backpack.isCombatVest) {
        currentWeight += backpackCurrentWeight;
      }
    } else {
      // No backpack -- add everything
      this.items.forEach(item => currentWeight += item.totalWeight);
    }

    const attributeBonus = this.characteristics.strength.bonus + this.characteristics.toughness.bonus;
    this.data.data.encumbrance = {
      max: 0,
      value: currentWeight,
      encumbered: false,
      backpack_max: backpackMaxWeight,
      backpack_value: backpackCurrentWeight,
      backpack_encumbered: false
    };
    switch (attributeBonus) {
      case 0:
        this.encumbrance.max = 0.9;
        break
      case 1:
        this.encumbrance.max = 2.25;
        break
      case 2:
        this.encumbrance.max = 4.5;
        break
      case 3:
        this.encumbrance.max = 9;
        break
      case 4:
        this.encumbrance.max = 18;
        break
      case 5:
        this.encumbrance.max = 27;
        break
      case 6:
        this.encumbrance.max = 36;
        break
      case 7:
        this.encumbrance.max = 45;
        break
      case 8:
        this.encumbrance.max = 56;
        break
      case 9:
        this.encumbrance.max = 67;
        break
      case 10:
        this.encumbrance.max = 78;
        break
      case 11:
        this.encumbrance.max = 90;
        break
      case 12:
        this.encumbrance.max = 112;
        break
      case 13:
        this.encumbrance.max = 225;
        break
      case 14:
        this.encumbrance.max = 337;
        break
      case 15:
        this.encumbrance.max = 450;
        break
      case 16:
        this.encumbrance.max = 675;
        break
      case 17:
        this.encumbrance.max = 900;
        break
      case 18:
        this.encumbrance.max = 1350;
        break
      case 19:
        this.encumbrance.max = 1800;
        break
      case 20:
        this.encumbrance.max = 2250;
        break
      default:
        this.encumbrance.max = 2250;
        break
    }

    if(this.encumbrance.value > this.encumbrance.max) {
      this.encumbrance.encumbered = true;
    }
    if(this.encumbrance.backpack_value > this.encumbrance.backpack_max) {
      this.encumbrance.backpack_encumbered = true;
    }
  }

  get backpack() {return this.data.data.backpack}
  get characteristics() {return this.data.data.characteristics}
  get skills() {return this.data.data.skills}
  get initiative() {return this.data.data.initiative}
  get wounds() {return this.data.data.wounds}
  get fatigue() {return this.data.data.fatigue}
  get fate() {return this.data.data.fate}
  get psy() {return this.data.data.psy}
  get bio() {return this.data.data.bio}
  get experience() {return this.data.data.experience}
  get insanity() {return this.data.data.insanity}
  get corruption() {return this.data.data.corruption}
  get aptitudes() {return this.data.data.aptitudes}
  get size() {return this.data.data.size}
  get faction() {return this.data.data.faction}
  get subfaction() {return this.data.data.subfaction}
  get subtype() {return this.data.data.type}
  get threatLevel() {return this.data.data.threatLevel}
  get armour() {return this.data.data.armour}
  get encumbrance() {return this.data.data.encumbrance}
  get movement() {return this.data.data.movement}

}
