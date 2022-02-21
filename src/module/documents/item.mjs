import {DarkHeresyItemContainer} from "./item-container.mjs";
import {capitalize} from "../helpers.mjs";

export class DarkHeresyItem extends DarkHeresyItemContainer {

  async prepareData() {
    super.prepareData();
    await this._determineNestedItems();
  }

  /**
   * This unlocks and loads nested items dynamically from the adjacent compendium.
   * I tried to find another way to do this but couldn't find anything online so I made my own hack.
   */
  async _determineNestedItems() {
    // Already has items just skip
    if(this.items && this.items.size > 0) return;

    // Check for specials
    if(this.data.data.special) {
      if(this.isWeapon) await this._updateSpecialsFromPack('dark-heresy-2nd.weapons', this.data.data.special);
      if(this.isAmmunition) await this._updateSpecialsFromPack('dark-heresy-2nd.ammo', this.data.data.special);
    }
  }

  async _updateSpecialsFromPack(pack, data) {
    const compendium = game.packs.find(p => p.collection === pack);
    if(!compendium) return;
    await compendium.configure({locked: false});
    const attackSpecials = await this._getAttackSpecials(data);
    if(attackSpecials.length > 0) {
      await this.createEmbeddedDocuments('Item', attackSpecials);
    }
    await compendium.configure({locked: true});
  }

  async _getAttackSpecials(specialData) {
    const attackSpecialPack = game.packs.find(p => p.collection === 'dark-heresy-2nd.attack-specials');
    if(!attackSpecialPack) return;
    const index = await attackSpecialPack.getIndex({fields: ["name", "img", "type", "data"]});
    const specials = [];
    for(const special of Object.keys(specialData)) {
      const specialName = capitalize(special);
      const attackSpecial = index.find(n => n.name === specialName);
      if(attackSpecial) {
        if(attackSpecial.data.hasLevel) {
          attackSpecial.data.level = specialData[special];
        } else {
          attackSpecial.data.enabled = specialData[special];
        }
        specials.push(attackSpecial);
      }
    }
    return specials;
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
  get isInBackpack() { return this.data.data.backpack?.inBackpack || false; }
  get isJournalEntry() { return this.type === "journalEntry"; }
  get isEnemy() { return this.type === "enemy"; }
  get isPeer() { return this.type === "peer"; }
}
