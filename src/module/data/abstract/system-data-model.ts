/**
 * Base data model for all WH40K RPG system data.
 * Provides common functionality for schema definition, validation, and template mixing.
 *
 * This uses template mix-ins similar to DND5E - each template defines its own schema
 * which is merged into the final schema for the Document type's Data Model.
 *
 * @see https://github.com/foundryvtt/dnd5e/blob/master/module/data/abstract/system-data-model.mjs
 */

export default class SystemDataModel extends foundry.abstract.TypeDataModel<Record<string, foundry.data.fields.DataField.Any>, any> {
    /**
     * System type that this data model represents (e.g. "acolyte", "npcV2", "vehicle").
     * @type {string}
     */
    static _systemType: string;

    /* -------------------------------------------- */

    /**
     * Base templates used for construction.
     * @type {typeof SystemDataModel[]}
     * @private
     */
    static _schemaTemplates: (typeof SystemDataModel)[] = [];

    /* -------------------------------------------- */

    /**
     * The field names of the base templates used for construction.
     * @type {Set<string>}
     * @private
     */
    static get _schemaTemplateFields(): Set<string> {
        const fieldNames = Object.freeze(new Set(this._schemaTemplates.map((t) => Array.from(t.schema.keys())).flat()));
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
    static _immiscible: Set<string> = new Set([
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
    static metadata: Record<string, unknown> = Object.freeze({
        systemFlagsModel: null,
    });

    get metadata(): Record<string, unknown> {
        return (this.constructor as typeof SystemDataModel).metadata;
    }

    /* -------------------------------------------- */

    /**
     * Key path to the description used for default embeds.
     * @type {string|null}
     */
    get embeddedDescriptionKeyPath(): string | null {
        return null;
    }

    /* -------------------------------------------- */
    /*  Schema Definition                           */
    /* -------------------------------------------- */

    /** @inheritDoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField> {
        const schema: Record<string, foundry.data.fields.DataField> = {};
        for (const template of this._schemaTemplates) {
            if (!template.defineSchema) {
                throw new Error(`Invalid WH40K template mixin ${String(template)} defined on class ${String(this.constructor)}`);
            }
            this.mergeSchema(schema, template.defineSchema());
        }
        return schema;
    }

    /* -------------------------------------------- */

    /**
     * Merge two schema definitions together as well as possible.
     * @param {Record<string, foundry.data.fields.DataField>} a  First schema that forms the basis for the merge. *Will be mutated.*
     * @param {Record<string, foundry.data.fields.DataField>} b  Second schema that will be merged in, overwriting any non-mergeable properties.
     * @returns {Record<string, foundry.data.fields.DataField>}  Fully merged schema.
     */
    static mergeSchema(
        a: Record<string, foundry.data.fields.DataField>,
        b: Record<string, foundry.data.fields.DataField>,
    ): Record<string, foundry.data.fields.DataField> {
        Object.assign(a, b);
        return a;
    }

    /* -------------------------------------------- */
    /*  Data Cleaning                               */
    /* -------------------------------------------- */

    /** @inheritDoc */
    static override cleanData(
        source?: Record<string, unknown>,
        options?: DataModelV14.CleaningOptions,
        _state?: DataModelV14.UpdateState,
    ): Record<string, unknown> {
        this._cleanData(source, options);
        const superClean = super.cleanData as DataModelV14.CleanDataSignature;
        return superClean.call(this, source, options, _state);
    }

    /* -------------------------------------------- */

    /**
     * Performs cleaning without calling DataModel.cleanData.
     * @param {object} [source]         The source data
     * @param {object} [options={}]     Additional options (see DataModel.cleanData)
     * @protected
     */
    static _cleanData(source?: Record<string, unknown>, options?: DataModelV14.CleaningOptions): void {
        for (const template of this._schemaTemplates) {
            (template as any)._cleanData?.(source, options);
        }
    }

    /* -------------------------------------------- */
    /*  Data Initialization                         */
    /* -------------------------------------------- */

    /** @inheritDoc */
    static override *_initializationOrder(): Generator<[string, foundry.data.fields.DataField], void, unknown> {
        for (const template of this._schemaTemplates) {
            for (const entry of template._initializationOrder()) {
                const field = this.schema.get(entry[0]);
                if (field) {
                    entry[1] = field;
                }
                yield entry;
            }
        }
        for (const [name, field] of this.schema.entries()) {
            if (this._schemaTemplateFields.has(name)) continue;
            yield [name, field];
        }
    }

    /* -------------------------------------------- */
    /*  Data Validation                             */
    /* -------------------------------------------- */

    /** @inheritDoc */
    static override validateJoint(data: Record<string, unknown>): void {
        this._validateJoint(data);
        return super.validateJoint(data as never);
    }

    /* -------------------------------------------- */

    /**
     * Performs joint validation without calling DataModel.validateJoint.
     * @param {object} data     The source data
     * @throws                  An error if a validation failure is detected
     * @protected
     */
    static _validateJoint(data: Record<string, unknown>): void {
        for (const template of this._schemaTemplates) {
            template._validateJoint?.(data);
        }
    }

    /* -------------------------------------------- */
    /*  Data Migration                              */
    /* -------------------------------------------- */

    /** @inheritDoc */
    static override migrateData(source: Record<string, unknown>): Record<string, unknown> {
        this._migrateData(source);
        return super.migrateData(source);
    }

    /* -------------------------------------------- */

    /**
     * Performs migration without calling DataModel.migrateData.
     * @param {object} source     The source data
     * @protected
     */
    static _migrateData(source: Record<string, unknown>): void {
        for (const template of this._schemaTemplates) {
            template._migrateData?.(source);
        }
    }

    /* -------------------------------------------- */

    /** @inheritDoc */
    static override shimData(data: Record<string, unknown>, options?: Record<string, unknown>): Record<string, unknown> {
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
    static _shimData(data: Record<string, unknown>, options?: Record<string, unknown>): void {
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
    static mixin(...templates: (typeof SystemDataModel)[]): typeof SystemDataModel {
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
    override prepareBaseData(): void {}

    /* -------------------------------------------- */

    /**
     * Perform preparatory operations after data preparation.
     */
    override prepareDerivedData(): void {}
}
