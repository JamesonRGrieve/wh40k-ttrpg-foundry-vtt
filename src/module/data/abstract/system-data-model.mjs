/**
 * Base data model for all Rogue Trader system data.
 * Provides common functionality for schema definition, validation, and template mixing.
 * 
 * This uses template mix-ins similar to DND5E - each template defines its own schema
 * which is merged into the final schema for the Document type's Data Model.
 * 
 * @see https://github.com/foundryvtt/dnd5e/blob/master/module/data/abstract/system-data-model.mjs
 */
export default class SystemDataModel extends foundry.abstract.TypeDataModel {
    /**
     * System type that this data model represents (e.g. "acolyte", "npcV2", "vehicle").
     * @type {string}
     */
    static _systemType;

    /* -------------------------------------------- */

    /**
     * Base templates used for construction.
     * @type {*[]}
     * @private
     */
    static _schemaTemplates = [];

    /* -------------------------------------------- */

    /**
     * The field names of the base templates used for construction.
     * @type {Set<string>}
     * @private
     */
    static get _schemaTemplateFields() {
        const fieldNames = Object.freeze(new Set(this._schemaTemplates.map(t => t.schema.keys()).flat()));
        Object.defineProperty(this, '_schemaTemplateFields', {
            value: fieldNames,
            writable: false,
            configurable: false,
        });
        return fieldNames;
    }

    /* -------------------------------------------- */
    /*  Data Model Configuration                    */
    /* -------------------------------------------- */

    /**
     * A list of properties that should not be mixed-in to the final type.
     * @type {Set<string>}
     * @private
     */
    static _immiscible = new Set([
        'length',
        'mixed',
        'name',
        'prototype',
        'cleanData',
        '_cleanData',
        '_initializationOrder',
        'validateJoint',
        '_validateJoint',
        'migrateData',
        '_migrateData',
        'shimData',
        '_shimData',
        'defineSchema',
    ]);

    /* -------------------------------------------- */

    /**
     * Metadata that describes this DataModel.
     * @type {SystemDataModelMetadata}
     */
    static metadata = Object.freeze({
        systemFlagsModel: null,
    });

    get metadata() {
        return this.constructor.metadata;
    }

    /* -------------------------------------------- */

    /**
     * Key path to the description used for default embeds.
     * @type {string|null}
     */
    get embeddedDescriptionKeyPath() {
        return null;
    }

    /* -------------------------------------------- */
    /*  Schema Definition                           */
    /* -------------------------------------------- */

    /** @inheritDoc */
    static defineSchema() {
        const schema = {};
        for (const template of this._schemaTemplates) {
            if (!template.defineSchema) {
                throw new Error(`Invalid RT template mixin ${template} defined on class ${this.constructor}`);
            }
            this.mergeSchema(schema, template.defineSchema());
        }
        return schema;
    }

    /* -------------------------------------------- */

    /**
     * Merge two schema definitions together as well as possible.
     * @param {DataSchema} a  First schema that forms the basis for the merge. *Will be mutated.*
     * @param {DataSchema} b  Second schema that will be merged in, overwriting any non-mergeable properties.
     * @returns {DataSchema}  Fully merged schema.
     */
    static mergeSchema(a, b) {
        Object.assign(a, b);
        return a;
    }

    /* -------------------------------------------- */
    /*  Data Cleaning                               */
    /* -------------------------------------------- */

    /** @inheritDoc */
    static cleanData(source, options) {
        this._cleanData(source, options);
        return super.cleanData(source, options);
    }

    /* -------------------------------------------- */

    /**
     * Performs cleaning without calling DataModel.cleanData.
     * @param {object} [source]         The source data
     * @param {object} [options={}]     Additional options (see DataModel.cleanData)
     * @protected
     */
    static _cleanData(source, options) {
        for (const template of this._schemaTemplates) {
            template._cleanData?.(source, options);
        }
    }

    /* -------------------------------------------- */
    /*  Data Initialization                         */
    /* -------------------------------------------- */

    /** @inheritDoc */
    static *_initializationOrder() {
        for (const template of this._schemaTemplates) {
            for (const entry of template._initializationOrder()) {
                entry[1] = this.schema.get(entry[0]);
                yield entry;
            }
        }
        for (const entry of this.schema.entries()) {
            if (this._schemaTemplateFields.has(entry[0])) continue;
            yield entry;
        }
    }

    /* -------------------------------------------- */
    /*  Data Validation                             */
    /* -------------------------------------------- */

    /** @inheritDoc */
    static validateJoint(data) {
        this._validateJoint(data);
        return super.validateJoint(data);
    }

    /* -------------------------------------------- */

    /**
     * Performs joint validation without calling DataModel.validateJoint.
     * @param {object} data     The source data
     * @throws                  An error if a validation failure is detected
     * @protected
     */
    static _validateJoint(data) {
        for (const template of this._schemaTemplates) {
            template._validateJoint?.(data);
        }
    }

    /* -------------------------------------------- */
    /*  Data Migration                              */
    /* -------------------------------------------- */

    /** @inheritDoc */
    static migrateData(source) {
        this._migrateData(source);
        return super.migrateData(source);
    }

    /* -------------------------------------------- */

    /**
     * Performs migration without calling DataModel.migrateData.
     * @param {object} source     The source data
     * @protected
     */
    static _migrateData(source) {
        for (const template of this._schemaTemplates) {
            template._migrateData?.(source);
        }
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    static shimData(data, options) {
        this._shimData(data, options);
        return super.shimData(data, options);
    }

    /* -------------------------------------------- */

    /**
     * Performs shimming without calling DataModel.shimData.
     * @param {object} data         The source data
     * @param {object} [options]    Additional options (see DataModel.shimData)
     * @protected
     */
    static _shimData(data, options) {
        for (const template of this._schemaTemplates) {
            template._shimData?.(data, options);
        }
    }

    /* -------------------------------------------- */
    /*  Mixins                                      */
    /* -------------------------------------------- */

    /**
     * Mix multiple templates with the base type.
     * @param {...*} templates            Template classes to mix.
     * @returns {typeof SystemDataModel}  Final prepared type.
     */
    static mixin(...templates) {
        for (const template of templates) {
            if (!(template.prototype instanceof SystemDataModel)) {
                throw new Error(`${template.name} is not a subclass of SystemDataModel`);
            }
        }

        const Base = class extends this {};
        Object.defineProperty(Base, '_schemaTemplates', {
            value: Object.seal([...this._schemaTemplates, ...templates]),
            writable: false,
            configurable: false,
        });

        for (const template of templates) {
            // Take all static methods and fields from template and mix in to base class
            for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(template))) {
                if (this._immiscible.has(key)) continue;
                Object.defineProperty(Base, key, descriptor);
            }

            // Take all instance methods and fields from template and mix in to base class
            for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(template.prototype))) {
                if (['constructor'].includes(key)) continue;
                Object.defineProperty(Base.prototype, key, descriptor);
            }
        }

        return Base;
    }

    /* -------------------------------------------- */
    /*  Data Preparation                            */
    /* -------------------------------------------- */

    /**
     * Perform preliminary operations before data preparation.
     */
    prepareBaseData() {}

    /* -------------------------------------------- */

    /**
     * Perform preparatory operations after data preparation.
     */
    prepareDerivedData() {}
}
