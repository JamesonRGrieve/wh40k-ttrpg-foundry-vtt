/**
 * Base data model for all Rogue Trader system data.
 * Provides common functionality for schema definition and validation.
 * 
 * V13 Best Practice: Extends TypeDataModel for type-specific document data.
 */
export default class SystemDataModel extends foundry.abstract.TypeDataModel {
    /**
     * System type that this data model represents.
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

    /* -------------------------------------------- */
    /*  Data Model Configuration                    */
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
    /*  Mixins                                      */
    /* -------------------------------------------- */

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

    /**
     * Perform preparatory operations after data preparation.
     */
    prepareDerivedData() {}

}
