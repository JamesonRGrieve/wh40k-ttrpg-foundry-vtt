import SystemDataModel from "./system-data-model.mjs";

const { NumberField } = foundry.data.fields;

/**
 * Base data model for all Item types in Rogue Trader.
 * Provides shared functionality and schema patterns for items.
 */
export default class ItemDataModel extends SystemDataModel {
    /* -------------------------------------------- */
    /*  Data Model Configuration                    */
    /* -------------------------------------------- */

    /** @type {ItemDataModelMetadata} */
    static metadata = Object.freeze(
        foundry.utils.mergeObject(
            super.metadata,
            { inplace: false },
        ),
    );

    /**
     * @inheritdoc
     */
    static defineSchema() {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),
        };
    }

    /* -------------------------------------------- */
    /*  Data Cleaning                               */
    /* -------------------------------------------- */

    /**
     * Clean source data before validation.
     * Coerces numeric string values to proper numbers for NumberFields.
     * @param {object} source - The source data object
     * @param {object} options - Additional options
     * @returns {object} The cleaned source data
     * @override
     */
    static cleanData(source = {}, options = {}) {
        // Recursively clean numeric fields
        this._cleanNumericFields(source, this.schema?.fields ?? {});
        return super.cleanData(source, options);
    }

    /**
     * Recursively clean numeric fields in source data.
     * @param {object} source - The source data object
     * @param {object} fields - The schema fields to check
     * @private
     */
    static _cleanNumericFields(source, fields) {
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
                this._cleanNumericFields(value, field.fields);
            }
        }
    }

    /* -------------------------------------------- */
    /*  Data Migration                              */
    /* -------------------------------------------- */

    /**
     * Migrate legacy item data to new structure.
     * Handles common patterns across all item types.
     * @inheritdoc
     */
    static migrateData(source) {
        // Handle common legacy field patterns

        // V13: Validate and clean img field - ensure valid file extension
        if (source.img) {
            const validExtensions = ['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'];
            const hasValidExtension = validExtensions.some((ext) => source.img.toLowerCase().endsWith(ext));
            if (!hasValidExtension) {
                // Invalid or missing extension - use default icons
                const defaultIcons = {
                    weapon: 'icons/svg/sword.svg',
                    armour: 'icons/svg/shield.svg',
                    gear: 'icons/svg/item-bag.svg',
                    talent: 'icons/svg/book.svg',
                    trait: 'icons/svg/blood.svg',
                    psychicPower: 'icons/svg/lightning.svg',
                    skill: 'icons/svg/target.svg',
                };
                // Use type-specific default or generic mystery-man
                source.img = defaultIcons[source.type] || 'icons/svg/mystery-man.svg';
            }
        }

        // Migrate flat description string to object structure
        if (typeof source.description === 'string') {
            source.description = {
                value: source.description,
                chat: '',
                summary: '',
            };
        }

        // Ensure description sub-fields are not null (V13 HTMLField strictness)
        if (source.description && typeof source.description === 'object') {
            if (source.description.chat === null || source.description.chat === undefined) {
                source.description.chat = '';
            }
            if (source.description.summary === null || source.description.summary === undefined) {
                source.description.summary = '';
            }
        }

        // Migrate flat source string to object structure
        if (typeof source.source === 'string') {
            source.source = {
                book: '',
                page: '',
                custom: source.source,
            };
        }

        // Ensure source sub-fields are not null
        if (source.source && typeof source.source === 'object') {
            if (source.source.book === null || source.source.book === undefined) {
                source.source.book = '';
            }
            if (source.source.page === null || source.source.page === undefined) {
                source.source.page = '';
            }
            if (source.source.custom === null || source.source.custom === undefined) {
                source.source.custom = '';
            }
        }

        // V13: Migrate coverage Array to Set (for armour items)
        if (source.coverage && Array.isArray(source.coverage)) {
            source.coverage = new Set(source.coverage);
        }

        // V13: Migrate properties Array to Set
        if (source.properties && Array.isArray(source.properties)) {
            source.properties = new Set(source.properties);
        }

        return super.migrateData(source);
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

    /* -------------------------------------------- */
    /*  Data Preparation                            */
    /* -------------------------------------------- */

    /**
     * @inheritdoc
     */
    prepareBaseData() {
        super.prepareBaseData();
    }

    /**
     * @inheritdoc
     */
    prepareDerivedData() {
        super.prepareDerivedData();
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
                rollData: this.parent.getRollData(),
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
