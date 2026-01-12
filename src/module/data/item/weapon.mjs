import ItemDataModel from "../abstract/item-data-model.mjs";
import DescriptionTemplate from "../shared/description-template.mjs";
import PhysicalItemTemplate from "../shared/physical-item-template.mjs";
import EquippableTemplate from "../shared/equippable-template.mjs";
import AttackTemplate from "../shared/attack-template.mjs";
import DamageTemplate from "../shared/damage-template.mjs";
import FormulaField from "../fields/formula-field.mjs";
import IdentifierField from "../fields/identifier-field.mjs";

/**
 * Data model for Weapon items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes PhysicalItemTemplate
 * @mixes EquippableTemplate
 * @mixes AttackTemplate
 * @mixes DamageTemplate
 */
export default class WeaponData extends ItemDataModel.mixin(
  DescriptionTemplate,
  PhysicalItemTemplate,
  EquippableTemplate,
  AttackTemplate,
  DamageTemplate
) {
  
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      
      identifier: new IdentifierField({ required: true, blank: true }),
      
      // Weapon classification
      class: new fields.StringField({
        required: true,
        initial: "melee",
        choices: [
          "melee", "pistol", "basic", "heavy", "thrown", "exotic",
          "chain", "power", "shock", "force"
        ]
      }),
      
      type: new fields.StringField({
        required: true,
        initial: "primitive",
        choices: [
          "primitive", "las", "solid-projectile", "bolt", "melta", "plasma",
          "flame", "launcher", "explosive", "power", "chain", "shock",
          "force", "exotic", "xenos"
        ]
      }),
      
      // Weapon properties
      twoHanded: new fields.BooleanField({ required: true, initial: false }),
      melee: new fields.BooleanField({ required: true, initial: false }),
      
      // Ammunition
      clip: new fields.SchemaField({
        max: new fields.NumberField({ required: true, initial: 0, min: 0 }),
        value: new fields.NumberField({ required: true, initial: 0, min: 0 }),
        type: new fields.StringField({ required: false, blank: true })
      }),
      reload: new fields.StringField({
        required: true,
        initial: "-",
        choices: ["-", "free", "half", "full", "2-full", "3-full"]
      }),
      

      
      // Modifications (references to weaponModification items)
      modifications: new fields.ArrayField(
        new fields.SchemaField({
          uuid: new fields.StringField({ required: true }),
          name: new fields.StringField({ required: true }),
          active: new fields.BooleanField({ required: true, initial: true })
        }),
        { required: true, initial: [] }
      ),
      
      // Proficiency required
      proficiency: new fields.StringField({ required: false, blank: true }),
      
      // Notes
      notes: new fields.StringField({ required: false, blank: true })
    };
  }

  /* -------------------------------------------- */
  /*  Data Preparation                            */
  /* -------------------------------------------- */

  /** @inheritdoc */
  static migrateData(source) {
    super.migrateData(source);
    
    // Ensure special is an array for SetField compatibility
    if (!Array.isArray(source.special)) {
      source.special = source.special ? Array.from(source.special) : [];
    }
    
    return source;
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /** @override */
  get isRollable() {
    return true;
  }

  /**
   * Is this a ranged weapon?
   * @type {boolean}
   */
  get isRangedWeapon() {
    return ["pistol", "basic", "heavy", "launcher"].includes(this.class);
  }

  /**
   * Is this a melee weapon?
   * @type {boolean}
   */
  get isMeleeWeapon() {
    return this.class === "melee" || this.melee;
  }

  /**
   * Does this weapon use ammunition?
   * @type {boolean}
   */
  get usesAmmo() {
    return this.clip.max > 0;
  }

  /**
   * Is the weapon jammed or out of ammo?
   * @type {boolean}
   */
  get isOutOfAmmo() {
    return this.usesAmmo && this.clip.value <= 0;
  }

  /**
   * Get effective qualities (base + craftsmanship-derived).
   * @type {Set<string>}
   */
  get effectiveSpecial() {
    const qualities = new Set(this.special || []);
    
    // Add craftsmanship-derived qualities for ranged weapons
    if (!this.melee && !this.isMeleeWeapon) {
      switch(this.craftsmanship) {
        case 'poor':
          qualities.add('unreliable-2');
          break;
        case 'cheap':
          qualities.add('unreliable');
          break;
        case 'good':
          qualities.add('reliable');
          qualities.delete('unreliable');
          qualities.delete('unreliable-2');
          break;
        case 'best':
        case 'master-crafted':
          qualities.add('never-jam');
          qualities.delete('unreliable');
          qualities.delete('unreliable-2');
          qualities.delete('overheats');
          break;
      }
    }
    
    return qualities;
  }

  /**
   * Get craftsmanship-derived stat modifiers.
   * @type {object}
   */
  get craftsmanshipModifiers() {
    const mods = {
      toHit: 0,      // WS/BS modifier
      damage: 0,     // Damage bonus
      weight: 1.0    // Weight multiplier
    };
    
    if (this.melee || this.isMeleeWeapon) {
      // Melee WS modifiers
      switch(this.craftsmanship) {
        case 'poor': mods.toHit = -15; break;
        case 'cheap': mods.toHit = -10; break;
        case 'good': mods.toHit = 5; break;
        case 'best': 
          mods.toHit = 10;
          mods.damage = 1;
          break;
        case 'master-crafted':
          mods.toHit = 20;
          mods.damage = 2;
          break;
      }
    } else {
      // Ranged BS modifiers
      if (this.craftsmanship === 'master-crafted') {
        mods.toHit = 10;
      }
    }
    
    return mods;
  }

  /**
   * Check if weapon has any craftsmanship-derived qualities.
   * @type {boolean}
   */
  get hasCraftsmanshipQualities() {
    if (this.melee || this.isMeleeWeapon) return false;
    return ['poor', 'cheap', 'good', 'best', 'master-crafted'].includes(this.craftsmanship);
  }

  /**
   * Get the reload time label.
   * @type {string}
   */
  get reloadLabel() {
    const labels = {
      "-": "-",
      "free": game.i18n.localize("RT.Reload.Free"),
      "half": game.i18n.localize("RT.Reload.Half"),
      "full": game.i18n.localize("RT.Reload.Full"),
      "2-full": game.i18n.localize("RT.Reload.2Full"),
      "3-full": game.i18n.localize("RT.Reload.3Full")
    };
    return labels[this.reload] ?? this.reload;
  }

  /**
   * Get the weapon class label.
   * @type {string}
   */
  get classLabel() {
    return game.i18n.localize(`RT.WeaponClass.${this.class.capitalize()}`);
  }

  /**
   * Get the weapon type label.
   * @type {string}
   */
  get typeLabel() {
    return game.i18n.localize(`RT.WeaponType.${this.type.split("-").map(s => s.capitalize()).join("")}`);
  }

  /* -------------------------------------------- */
  /*  Chat Properties                             */
  /* -------------------------------------------- */

  /** @override */
  get chatProperties() {
    const props = [
      ...PhysicalItemTemplate.prototype.chatProperties.call(this),
      ...AttackTemplate.prototype.chatProperties.call(this),
      ...DamageTemplate.prototype.chatProperties.call(this)
    ];
    
    props.unshift(`${this.classLabel} (${this.typeLabel})`);
    
    if ( this.usesAmmo ) {
      props.push(`Clip: ${this.clip.value}/${this.clip.max}`);
      props.push(`Reload: ${this.reloadLabel}`);
    }
    
    // Show effective qualities (including craftsmanship)
    if ( this.effectiveSpecial?.size ) {
      props.push(`Qualities: ${Array.from(this.effectiveSpecial).join(", ")}`);
    }
    
    // Show craftsmanship modifiers if any
    const craftMods = this.craftsmanshipModifiers;
    if (craftMods.toHit !== 0 || craftMods.damage !== 0) {
      const modParts = [];
      if (craftMods.toHit !== 0) modParts.push(`${craftMods.toHit > 0 ? '+' : ''}${craftMods.toHit} Hit`);
      if (craftMods.damage !== 0) modParts.push(`+${craftMods.damage} Dmg`);
      props.push(`Craftsmanship: ${modParts.join(', ')}`);
    }
    
    return props;
  }

  /* -------------------------------------------- */
  /*  Header Labels                               */
  /* -------------------------------------------- */

  /** @override */
  get headerLabels() {
    return {
      class: this.classLabel,
      type: this.typeLabel,
      damage: this.damageLabel,
      pen: this.damage.penetration,
      range: this.rangeLabel,
      rof: this.rateOfFireLabel
    };
  }

  /* -------------------------------------------- */
  /*  Display Properties                          */
  /* -------------------------------------------- */

  /**
   * Get icon class for weapon class.
   * @type {string}
   */
  get classIcon() {
    const icons = {
      melee: "fa-sword",
      pistol: "fa-gun",
      basic: "fa-crosshairs",
      heavy: "fa-bullseye",
      thrown: "fa-hand",
      exotic: "fa-atom",
      chain: "fa-link",
      power: "fa-bolt",
      shock: "fa-bolt",
      force: "fa-wand-sparkles"
    };
    return icons[this.class] ?? "fa-crosshairs";
  }

  /**
   * Get icon class for weapon type.
   * @type {string}
   */
  get typeIcon() {
    const icons = {
      primitive: "fa-axe",
      las: "fa-laser-pointer",
      "solid-projectile": "fa-crosshairs",
      bolt: "fa-meteor",
      melta: "fa-fire-flame-curved",
      plasma: "fa-sun",
      flame: "fa-fire",
      launcher: "fa-rocket",
      explosive: "fa-bomb",
      power: "fa-bolt-lightning",
      chain: "fa-link-slash",
      shock: "fa-bolt",
      force: "fa-wand-magic-sparkles",
      exotic: "fa-alien",
      xenos: "fa-alien"
    };
    return icons[this.type] ?? "fa-crosshairs";
  }

  /**
   * Get ammunition percentage for visual display.
   * @type {number}
   */
  get ammoPercentage() {
    if (!this.usesAmmo || this.clip.max === 0) return 100;
    return Math.round((this.clip.value / this.clip.max) * 100);
  }

  /**
   * Get ammunition status class for styling.
   * @type {string}
   */
  get ammoStatus() {
    const pct = this.ammoPercentage;
    if (pct === 0) return "empty";
    if (pct <= 25) return "critical";
    if (pct <= 50) return "low";
    return "good";
  }

  /**
   * Get jam threshold for ranged weapons.
   * @type {number|null}
   */
  get jamThreshold() {
    if (this.isMeleeWeapon) return null;
    
    const qualities = this.effectiveSpecial;
    if (qualities.has("never-jam")) return null;
    if (qualities.has("reliable")) return 100; // Only jams on natural 100
    if (qualities.has("unreliable-2")) return 91; // Jams on 91+
    if (qualities.has("unreliable")) return 96; // Jams on 96+
    if (qualities.has("overheats")) return 91; // Overheats on 91+
    return 96; // Default jam on 96+
  }

  /**
   * Get a compact summary string for compendium/list display.
   * @type {string}
   */
  get compendiumSummary() {
    const parts = [];
    parts.push(this.damageLabel || "-");
    if (this.damage.penetration > 0) parts.push(`Pen ${this.damage.penetration}`);
    if (this.isRangedWeapon && this.rangeLabel !== "-") parts.push(this.rangeLabel);
    return parts.join(" • ");
  }

  /**
   * Get full stat line for display.
   * @type {string}
   */
  get statLine() {
    const parts = [];
    parts.push(`${this.classLabel}`);
    if (this.isRangedWeapon) {
      parts.push(`${this.rangeLabel}`);
      parts.push(`RoF: ${this.rateOfFireLabel}`);
    }
    parts.push(`${this.damageLabel}`);
    parts.push(`Pen: ${this.damage.penetration}`);
    if (this.usesAmmo) parts.push(`Clip: ${this.clip.max}`);
    return parts.join(" | ");
  }

  /**
   * Get qualities as array of objects with labels and descriptions.
   * @type {Array<{id: string, label: string, description: string, level: number|null}>}
   */
  get qualitiesArray() {
    const qualities = [];
    const config = CONFIG.ROGUE_TRADER?.weaponQualities ?? {};
    
    for (const qualityId of this.effectiveSpecial) {
      // Parse level from quality ID (e.g., "blast-3" -> "blast", 3)
      const match = qualityId.match(/^(.+?)-(\d+)$/);
      const baseId = match ? match[1] : qualityId;
      const level = match ? parseInt(match[2]) : null;
      
      const definition = config[baseId] || config[qualityId];
      
      qualities.push({
        id: qualityId,
        baseId: baseId,
        label: definition?.label ? game.i18n.localize(definition.label) : qualityId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        description: definition?.description ? game.i18n.localize(definition.description) : "",
        level: level,
        hasLevel: definition?.hasLevel ?? false
      });
    }
    
    return qualities;
  }

  /**
   * Check if weapon is two-handed.
   * @type {boolean}
   */
  get isTwoHanded() {
    return this.twoHanded || this.class === "heavy";
  }

  /**
   * Get hands required string.
   * @type {string}
   */
  get handsLabel() {
    return this.isTwoHanded ? game.i18n.localize("RT.Weapon.TwoHanded") : game.i18n.localize("RT.Weapon.OneHanded");
  }

  /* -------------------------------------------- */
  /*  Actions                                     */
  /* -------------------------------------------- */

  /**
   * Fire the weapon, consuming ammunition.
   * @param {number} [shots=1]   Number of shots to fire.
   * @returns {Promise<Item>}
   */
  async fire(shots = 1) {
    if ( !this.usesAmmo ) return this.parent;
    const newValue = Math.max(0, this.clip.value - shots);
    return this.parent?.update({ "system.clip.value": newValue });
  }

  /**
   * Reload the weapon.
   * @param {number} [amount]   Amount to reload (defaults to full).
   * @returns {Promise<Item>}
   */
  async reload(amount = null) {
    if ( !this.usesAmmo ) return this.parent;
    const newValue = amount ?? this.clip.max;
    return this.parent?.update({ "system.clip.value": Math.min(newValue, this.clip.max) });
  }
}
