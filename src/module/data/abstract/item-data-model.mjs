import SystemDataModel from "./system-data-model.mjs";

const { NumberField } = foundry.data.fields;

/**
 * Base data model for all Item types in Rogue Trader.
 * Provides shared functionality and schema patterns for items.
 * 
 * Uses template delegation pattern - subclasses should override:
 * - `_migrateData(source)` for migration (NOT migrateData)
 * - `_cleanData(source, options)` for cleaning (NOT cleanData)
 * 
 * @see SystemDataModel for mixin and template delegation details
 */
export default class ItemDataModel extends SystemDataModel {
    /* -------------------------------------------- */
    /*  Data Model Configuration                    */
    /* -------------------------------------------- */

    /**
     * Metadata describing this item data model.
     * @type {ItemDataModelMetadata}
     */
    static metadata = Object.freeze(foundry.utils.mergeObject(super.metadata, {
        enchantable: false,
        hasEffects: false,
        singleton: false,
    }, { inplace: false }));

    /**
     * @inheritdoc
     */
    static defineSchema() {
        return this.mergeSchema(super.defineSchema(), {});
    }

    /* -------------------------------------------- */
    /*  Data Cleaning                               */
    /* -------------------------------------------- */

    /**
     * Performs cleaning on item source data.
     * Template delegation method - called by SystemDataModel.cleanData().
     * @param {object} [source]       The source data
     * @param {object} [options={}]   Additional options
     * @protected
     */
    static _cleanData(source, options) {
        super._cleanData?.(source, options);
        ItemDataModel.#cleanNumericFields(source, this.schema?.fields ?? {});
    }

    /**
     * Recursively clean numeric fields in source data.
     * Coerces numeric string values to proper numbers for NumberFields.
     * @param {object} source - The source data object
     * @param {object} fields - The schema fields to check
     */
    static #cleanNumericFields(source, fields) {
        if (!source || typeof source !== 'object') return;

        for (const [key, field] of Object.entries(fields)) {
            if (!(key in source)) continue;

            const value = source[key];

            // Handle NumberField - coerce string to number
            if (field instanceof NumberField) {
                if (typeof value === 'string') {
                    const num = Number(value);
                    if (!Number.isNaN(num)) {
                        source[key] = field.integer ? Math.floor(num) : num;
                    }
                }
            }
            // Handle SchemaField - recurse into nested fields
            else if (field?.fields && typeof value === 'object' && value !== null) {
                ItemDataModel.#cleanNumericFields(value, field.fields);
            }
        }
    }

    /* -------------------------------------------- */
    /*  Data Migration                              */
    /* -------------------------------------------- */

    /**
     * Performs migration on item source data.
     * Template delegation method - called by SystemDataModel.migrateData().
     * Subclasses should override this, not migrateData().
     * @param {object} source  The source data
     * @protected
     */
    static _migrateData(source) {
        super._migrateData?.(source);
        ItemDataModel.#migrateImg(source);
        ItemDataModel.#migrateDescription(source);
        ItemDataModel.#migrateSource(source);
        ItemDataModel.#migrateCollections(source);
    }

    /**
     * Validate and fix img field - ensure valid file extension.
     * @param {object} source  The source data
     */
    static #migrateImg(source) {
        if (!source.img) return;
        
        const validExtensions = ['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'];
        const hasValidExtension = validExtensions.some((ext) => source.img.toLowerCase().endsWith(ext));
        if (!hasValidExtension) {
            const defaultIcons = {
                weapon: 'icons/svg/sword.svg',
                armour: 'icons/svg/shield.svg',
                gear: 'icons/svg/item-bag.svg',
                talent: 'icons/svg/book.svg',
                trait: 'icons/svg/blood.svg',
                psychicPower: 'icons/svg/lightning.svg',
                skill: 'icons/svg/target.svg',
            };
            source.img = defaultIcons[source.type] || 'icons/svg/mystery-man.svg';
        }
    }

    /**
     * Migrate flat description string to object structure.
     * @param {object} source  The source data
     */
    static #migrateDescription(source) {
        if (typeof source.description === 'string') {
            source.description = {
                value: source.description,
                chat: '',
                summary: '',
            };
        }

        // Ensure description sub-fields are not null (V13 HTMLField strictness)
        if (source.description && typeof source.description === 'object') {
            source.description.chat ??= '';
            source.description.summary ??= '';
        }
    }

    /**
     * Migrate flat source string to object structure.
     * @param {object} source  The source data
     */
    static #migrateSource(source) {
        if (typeof source.source === 'string') {
            source.source = {
                book: '',
                page: '',
                custom: source.source,
            };
        }

        // Ensure source sub-fields are not null
        if (source.source && typeof source.source === 'object') {
            source.source.book ??= '';
            source.source.page ??= '';
            source.source.custom ??= '';
        }
    }

    /**
     * Migrate Array fields to Set (V13 requirement).
     * @param {object} source  The source data
     */
    static #migrateCollections(source) {
        if (source.coverage && Array.isArray(source.coverage)) {
            source.coverage = new Set(source.coverage);
        }
        if (source.properties && Array.isArray(source.properties)) {
            source.properties = new Set(source.properties);
        }
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * The Item document that contains this data model.
     * @type {Item}
     */
    get item() {
        return this.parent;
    }

    /**
     * The Actor that owns this item, if any.
     * @type {Actor|null}
     */
    get actor() {
        return this.parent?.actor ?? null;
    }

    /**
     * A human-readable label for this item type.
     * @type {string}
     */
    get typeLabel() {
        return game.i18n.localize(CONFIG.Item.typeLabels[this.parent.type]);
    }

    /**
     * Whether this item can be rolled/activated.
     * @type {boolean}
     */
    get isRollable() {
        return false;
    }

    /** @override */
    get embeddedDescriptionKeyPath() {
        return "description.value";
    }

    /* -------------------------------------------- */
    /*  Data Preparation                            */
    /* -------------------------------------------- */

    /** @inheritdoc */
    prepareBaseData() {
        super.prepareBaseData();
    }

    /** @inheritdoc */
    prepareDerivedData() {
        super.prepareDerivedData();
    }

    /**
     * Prepare data related to embedded items after actor data is prepared.
     * Called by the parent Actor after its own data is prepared.
     */
    prepareEmbeddedData() {}

    /* -------------------------------------------- */
    /*  Roll Data                                   */
    /* -------------------------------------------- */

    /**
     * Prepare a data object for dice roll formulas.
     * @param {object} [options]
     * @param {boolean} [options.deterministic]  Force deterministic values for die terms.
     * @returns {object}
     */
    getRollData({ deterministic = false } = {}) {
        const actorRollData = this.parent.actor?.getRollData({ deterministic }) ?? {};
        const data = { ...actorRollData, item: { ...this } };
        return data;
    }

    /* -------------------------------------------- */
    /*  Helpers                                     */
    /* -------------------------------------------- */

    /**
     * Retrieve the source book reference for this item.
     * @type {string}
     */
    get sourceReference() {
        if (typeof this.source === 'string') return this.source;
        const { book, page, custom } = this.source ?? {};
        if (custom) return custom;
        if (book && page) return `${book}, p.${page}`;
        if (book) return book;
        return '';
    }

    /**
     * Generate chat data for this item.
     * @param {object} htmlOptions   Options passed to enrichHTML.
     * @returns {Promise<object>}
     */
    async getChatData(htmlOptions = {}) {
        const descValue = typeof this.description === 'string' ? this.description : this.description?.value ?? '';
        const data = {
            description: await TextEditor.enrichHTML(descValue, {
                ...htmlOptions,
                rollData: this.getRollData(),
            }),
            properties: this.chatProperties ?? [],
        };
        return data;
    }

    /**
     * Properties displayed in chat.
     * @type {string[]}
     */
    get chatProperties() {
        return [];
    }

    /**
     * Get labels for the item sheet header.
     * @type {object}
     */
    get headerLabels() {
        return {};
    }
}
