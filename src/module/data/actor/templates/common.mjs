import ActorDataModel from "../../abstract/actor-data-model.mjs";

const { NumberField, SchemaField, StringField, BooleanField } = foundry.data.fields;

/**
 * Common template for all actor types in Rogue Trader.
 * Contains shared schema elements like wounds, characteristics, and initiative.
 * @extends {ActorDataModel}
 */
export default class CommonTemplate extends ActorDataModel {

  /* -------------------------------------------- */
  /*  Model Configuration                         */
  /* -------------------------------------------- */

  /** @inheritDoc */
  static defineSchema() {
    // Characteristic schema factory

    return {
      ...super.defineSchema(),
    };
  }

  /** @override */
  static migrateData(source) {
    return super.migrateData(source);
  }

  /** @override */
  static cleanData(source, options = {}) {
    return super.cleanData(source, options);
  }

  /* -------------------------------------------- */
  /*  Data Preparation                            */
  /* -------------------------------------------- */

  /** @inheritDoc */
  prepareBaseData() {
    super.prepareBaseData();
  }

  /** @inheritDoc */
  prepareDerivedData() {
    super.prepareDerivedData();
  }

}
