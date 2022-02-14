import {DarkHeresyItemContainer} from "./item-container.mjs";

export class DarkHeresyItem extends DarkHeresyItemContainer {

  prepareData() {
    super.prepareData();
  }

  get totalWeight() {
    let weight = this.data.data.weight || 0;
    if (this.items && this.items.size > 0) {
      this.items.forEach(item => weight += item.totalWeight);
    }
    return weight;
  }

  get isMentalDisorder() { return this.type === "mentalDisorder"; }
  get isMalignancy() { return this.type === "malignancy"; }
  get isMutation() { return this.type === "mutation"; }
  get isTalent() { return this.type === "talent"; }
  get isTrait() { return this.type === "trait"; }
  get isAptitude() { return this.type === "aptitude"; }
  get isSpecialAbility() { return this.type === "specialAbility"; }
  get isPsychicPower() { return this.type === "psychicPower"; }
  get isCriticalInjury() { return this.type === "criticalInjury"; }
  get isWeapon() { return this.type === "weapon"; }
  get isRanged() { return this.type === "weapon" && this.data.data.class.toLowerCase() !== 'melee';}
  get isMelee() { return this.type === "weapon" && this.data.data.class.toLowerCase() === 'melee';}
  get isArmour() { return this.type === "armour"; }
  get isArmourModification() { return this.type === "armourModification"; }
  get isGear() { return this.type === "gear" || this.type === 'drug' || this.type === 'tool' || this.type === 'ammunition' || this.type === 'forceField'; }
  get isDrug() { return this.type === "drug"; }
  get isTool() { return this.type === "tool"; }
  get isCybernetic() { return this.type === "cybernetic"; }
  get isWeaponModification() { return this.type === "weaponModification"; }
  get isAmmunition() { return this.type === "ammunition"; }
  get isForceField() { return this.type === "forceField"; }
  get isAttackSpecial() { return this.type === "attackSpecial"; }
  get isStorageLocation() { return this.type === "storageLocation"; }
  get isBackpack() { return this.type === "backpack"; }
  get isInBackpack() { return this.data.data.backpack.inBackpack || false; }
}
