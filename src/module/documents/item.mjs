
export class DarkHeresyItem extends Item {

  prepareData() {
    const data = super.prepareData();
    return data;
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
  get isRanged() {
    console.log(this);
    return this.type === "weapon" && this.data.data.class.toLowerCase() !== 'melee';
  }
  get isArmour() { return this.type === "armour"; }
  get isGear() { return this.type === "gear"; }
  get isDrug() { return this.type === "drug"; }
  get isTool() { return this.type === "tool"; }
  get isCybernetic() { return this.type === "cybernetic"; }
  get isWeaponModification() { return this.type === "weaponModification"; }
  get isAmmunition() { return this.type === "ammunition"; }
  get isForceField() { return this.type === "forceField"; }

}
