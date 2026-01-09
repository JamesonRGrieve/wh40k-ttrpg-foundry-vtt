import ItemDataModel from "../abstract/item-data-model.mjs";
import DescriptionTemplate from "../shared/description-template.mjs";
import ModifiersTemplate from "../shared/modifiers-template.mjs";
import IdentifierField from "../fields/identifier-field.mjs";

/**
 * Data model for Trait items.
 * @extends ItemDataModel
 * @mixes DescriptionTemplate
 * @mixes ModifiersTemplate
 */
export default class TraitData extends ItemDataModel.mixin(
  DescriptionTemplate,
  ModifiersTemplate
) {
  
  /** @inheritdoc */
  static defineSchema() {
    const fields = foundry.data.fields;
    return {
      ...super.defineSchema(),
      
      identifier: new IdentifierField({ required: true, blank: true }),
      
      // Level/rating (matching template.json)
      level: new fields.NumberField({ required: true, initial: 0, min: 0, integer: true }),
      
      // Notes
      notes: new fields.StringField({ required: false, blank: true })
    };
  }

  /* -------------------------------------------- */
  /*  Properties                                  */
  /* -------------------------------------------- */

  /**
   * Does this trait have a level/rating?
   * @type {boolean}
   */
  get hasLevel() {
    return this.level > 0;
  }

  /**
   * Get the full name including level.
   * @type {string}
   */
  get fullName() {
    let name = this.parent?.name ?? "";
    if ( this.hasLevel ) {
      name += ` (${this.level})`;
    }
    return name;
  }

  /* -------------------------------------------- */
  /*  Chat Properties                             */
  /* -------------------------------------------- */

  /** @override */
  get chatProperties() {
    const props = [];
    
    if ( this.hasLevel ) {
      props.push(`Level: ${this.level}`);
    }
    
    return props;
  }

  /* -------------------------------------------- */
  /*  Header Labels                               */
  /* -------------------------------------------- */

  /** @override */
  get headerLabels() {
    return {
      level: this.hasLevel ? this.level : "-"
    };
  }

  /**
   * Get category label.
   * @type {string}
   */
  get categoryLabel() {
    const categories = {
      creature: "Creature",
      character: "Character",
      elite: "Elite",
      unique: "Unique",
      origin: "Origin Path",
      general: "General"
    };
    return categories[this.category] || "General";
  }

  /**
   * Is this a variable trait (name contains (X))?
   * @type {boolean}
   */
  get isVariable() {
    const name = this.parent?.name ?? "";
    return name.includes("(X)") || name.includes("(x)");
  }

  /**
   * Get the category field value.
   * @type {string}
   */
  get category() {
    return foundry.utils.getProperty(this, "category") || "general";
  }

  /**
   * Get the requirements field value.
   * @type {string}
   */
  get requirements() {
    return foundry.utils.getProperty(this, "requirements") || "";
  }

  /**
   * Get the benefit field value (HTML).
   * @type {string}
   */
  get benefit() {
    return foundry.utils.getProperty(this, "benefit") || "";
  }

  /* -------------------------------------------- */
  /*  Vocalization                                */
  /* -------------------------------------------- */

  /**
   * Post this trait to chat as a rich card.
   * @param {object} [options]  Additional options
   * @returns {Promise<ChatMessage>}
   */
  async toChat(options = {}) {
    // Prepare template data
    const templateData = {
      trait: this.parent,
      category: this.category,
      categoryLabel: this.categoryLabel,
      level: this.level,
      hasLevel: this.hasLevel,
      requirements: this.requirements,
      benefit: this.benefit,
      notes: this.notes,
      fullName: this.fullName,
      isVariable: this.isVariable,
      timestamp: new Date().toLocaleString()
    };

    // Render chat template
    const content = await renderTemplate(
      "systems/rogue-trader/templates/chat/trait-card.hbs",
      templateData
    );

    // Prepare chat message data
    const chatData = {
      user: game.user.id,
      speaker: ChatMessage.getSpeaker(),
      type: CONST.CHAT_MESSAGE_TYPES.OTHER,
      content: content,
      flags: {
        "rogue-trader": {
          itemId: this.parent.id,
          itemType: "trait"
        }
      }
    };

    // Apply roll mode
    ChatMessage.applyRollMode(chatData, options.rollMode || game.settings.get("core", "rollMode"));

    // Create and return chat message
    return ChatMessage.create(chatData);
  }
}
