/**
 * BOUNDARY-HEAVY FILE: this is the abstract base for every WH40K Foundry V14 Item
 * DataModel. The `_migrateData` / `_cleanData` / `defineSchema` overrides operate on
 * raw `source` payloads from Foundry's V14 cleaning pipeline — those payloads carry
 * no schema until they pass through this very file, so `Record<string, unknown>` is
 * the correct boundary type. Per CLAUDE.md, framework-boundary `Record<string,
 * unknown>` / `unknown` casts are permitted here. New non-boundary helpers MUST be
 * typed normally.
 */
/* eslint-disable no-restricted-syntax -- migration / cleaning operate on raw Foundry V14 source payloads (true framework boundary) */
import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import type { WH40KItem } from '../../documents/item.ts';
import { inferActiveGameLine, isLineVariantContainer, materializeItemVariants } from '../../utils/item-variant-utils.ts';
import SystemDataModel from './system-data-model.ts';

const { NumberField } = foundry.data.fields;

/**
 * Base data model for all Item types in WH40K RPG.
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

    /** Declare dynamic properties used by subclasses */
    declare description: { value: string; chat: string; summary: string } | string;
    declare source: { book: string; page: string; custom: string } | string;
    declare chatProperties: string[];

    /**
     * Metadata describing this item data model.
     * @type {ItemDataModelMetadata}
     */
    static override metadata = Object.freeze(
        foundry.utils.mergeObject(
            super.metadata,
            {
                enchantable: false,
                hasEffects: false,
                singleton: false,
            },
            { inplace: false },
        ),
    );

    /**
     * @inheritdoc
     */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
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
    static override _cleanData(source?: Record<string, unknown>, options?: DataModelV14.CleaningOptions): void {
        super._cleanData(source, options);
        ItemDataModel.#cleanNumericFields(source, this.schema.fields as Record<string, foundry.data.fields.DataField.Any>);
    }

    /**
     * Recursively clean numeric fields in source data.
     * Coerces numeric string values to proper numbers for NumberFields.
     * @param {object} source - The source data object
     * @param {Record<string, foundry.data.fields.DataField.Any>} fields - The schema fields to check
     */
    static #cleanNumericFields(
        source: Record<string, unknown> | undefined,
        fields: Record<string, foundry.data.fields.DataField.Any>,
        processed = new Set<object>(),
    ): void {
        if (!source || typeof source !== 'object' || processed.has(source)) return;
        processed.add(source);

        for (const [key, field] of Object.entries(fields)) {
            if (!(key in source)) continue;

            const value = source[key];

            // Handle NumberField - coerce string to number
            if (field instanceof NumberField) {
                if (typeof value === 'string') {
                    const num = Number(value);
                    if (!Number.isNaN(num)) {
                        source[key] = (field as foundry.data.fields.NumberField).integer ? Math.floor(num) : num;
                    }
                }
            }
            // Handle SchemaField - recurse into nested fields
            else if (field instanceof foundry.data.fields.SchemaField && typeof value === 'object' && value !== null) {
                ItemDataModel.#cleanNumericFields(
                    value as Record<string, unknown>,
                    field.fields as Record<string, foundry.data.fields.DataField.Any>,
                    processed,
                );
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
    static override _migrateData(source: Record<string, unknown>): void {
        super._migrateData(source);
        ItemDataModel.#migrateImg(source);
        ItemDataModel.#migrateDescription(source);
        ItemDataModel.#migrateSource(source);
        ItemDataModel.#migrateCollections(source);
        ItemDataModel.#flattenLineVariants(source);
    }

    /**
     * Flatten per-game-line variant containers (e.g. `modifiers: { dh2: {...}, rt: {...} }`)
     * down to the active line's branch (e.g. `modifiers: {...}`) so that schema validation
     * sees a payload matching the flat field shape declared in `defineSchema()`. Without
     * this step, Foundry's validator strips the unknown `dh1/dh2/rt/...` keys and falls
     * back to schema initials (typically 0 / empty Set), surfacing as "all zeros" in
     * compendium item sheets for ammunition, weapons, armour, etc.
     *
     * The raw on-disk JSON is unaffected; only the in-memory document source is flattened.
     * @param {object} source  The source data
     */
    static #flattenLineVariants(source: Record<string, unknown>): void {
        const systemContainer = source['system'];
        // Foundry passes the inner `system` payload directly in most paths; some legacy
        // call sites pass the whole document. Materialize whichever shape we received.
        if (systemContainer !== null && typeof systemContainer === 'object' && !Array.isArray(systemContainer)) {
            const systemSource = systemContainer as Record<string, unknown>;
            const lineKey = inferActiveGameLine(systemSource);
            materializeItemVariants(systemSource, lineKey);
            return;
        }
        const lineKey = inferActiveGameLine(source);
        materializeItemVariants(source, lineKey);
    }

    /**
     * Validate and fix img field - ensure valid file extension.
     * @param {object} source  The source data
     */
    static #migrateImg(source: Record<string, unknown>): void {
        if (typeof source['img'] !== 'string' || source['img'] === '') return;

        const img = source['img'];
        const validExtensions = ['.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'];
        const hasValidExtension = validExtensions.some((ext) => img.toLowerCase().endsWith(ext));
        if (!hasValidExtension) {
            const defaultIcons: Record<string, string> = {
                weapon: 'icons/svg/sword.svg',
                armour: 'icons/svg/shield.svg',
                gear: 'icons/svg/item-bag.svg',
                talent: 'icons/svg/book.svg',
                trait: 'icons/svg/blood.svg',
                psychicPower: 'icons/svg/lightning.svg',
                skill: 'icons/svg/target.svg',
            };
            const type = typeof source['type'] === 'string' ? source['type'] : '';
            source['img'] = defaultIcons[type] ?? 'icons/svg/mystery-man.svg';
        }
    }

    /**
     * Migrate flat description string to object structure.
     * @param {object} source  The source data
     */
    static #migrateDescription(source: Record<string, unknown>): void {
        if (typeof source['description'] === 'string') {
            source['description'] = {
                value: source['description'],
                chat: '',
                summary: '',
            };
        }
        if (isLineVariantContainer(source['description'])) return;

        // Ensure description sub-fields are not null (V13 HTMLField strictness)
        if (source['description'] !== null && typeof source['description'] === 'object') {
            const desc = source['description'] as Record<string, unknown>;
            desc['chat'] ??= '';
            desc['summary'] ??= '';
        }
    }

    /**
     * Migrate flat source string to object structure.
     * @param {object} source  The source data
     */
    static #migrateSource(source: Record<string, unknown>): void {
        if (typeof source['source'] === 'string') {
            source['source'] = {
                book: '',
                page: '',
                custom: source['source'],
            };
        }
        if (isLineVariantContainer(source['source'])) return;

        // Ensure source sub-fields are not null
        if (source['source'] !== null && typeof source['source'] === 'object') {
            const src = source['source'] as Record<string, unknown>;
            src['book'] ??= '';
            src['page'] ??= '';
            src['custom'] ??= '';
        }
    }

    /**
     * Migrate Array fields to Set (V13 requirement).
     * @param {object} source  The source data
     */
    static #migrateCollections(source: Record<string, unknown>): void {
        if (Array.isArray(source['coverage'])) {
            source['coverage'] = new Set(source['coverage']);
        }
        if (Array.isArray(source['properties'])) {
            source['properties'] = new Set(source['properties']);
        }
    }

    /* -------------------------------------------- */
    /*  Properties                                  */
    /* -------------------------------------------- */

    /**
     * The Item document that contains this data model.
     * @type {WH40KItem}
     */
    get item(): WH40KItem {
        return this.parent as WH40KItem;
    }

    /**
     * The Actor that owns this item, if any.
     * @type {Actor|null}
     */
    get actor(): WH40KBaseActor | null {
        return (this.parent as WH40KItem | undefined)?.actor ?? null;
    }

    /**
     * A human-readable label for this item type.
     * @type {string}
     */
    get typeLabel(): string {
        const item = this.parent as WH40KItem;
        const labels = CONFIG.Item.typeLabels as Record<string, string>;
        return game.i18n.localize(labels[item.type] ?? item.type);
    }

    /**
     * Whether this item can be rolled/activated.
     * @type {boolean}
     */
    get isRollable(): boolean {
        return false;
    }

    /** @override */
    override get embeddedDescriptionKeyPath(): string {
        return 'description.value';
    }

    /* -------------------------------------------- */
    /*  Data Preparation                            */
    /* -------------------------------------------- */

    /** @inheritdoc */
    override prepareBaseData(): void {
        super.prepareBaseData();
    }

    /** @inheritdoc */
    override prepareDerivedData(): void {
        super.prepareDerivedData();
    }

    /**
     * Prepare data related to embedded items after actor data is prepared.
     * Called by the parent Actor after its own data is prepared.
     */
    prepareEmbeddedData(): void {}

    /* -------------------------------------------- */
    /*  Roll Data                                   */
    /* -------------------------------------------- */

    /**
     * Prepare a data object for dice roll formulas.
     * @param {object} [options]
     * @param {boolean} [options.deterministic]  Force deterministic values for die terms.
     * @returns {object}
     */
    getRollData({ deterministic = false } = {}): Record<string, unknown> {
        type RollDataActor = { getRollData: (opts: { deterministic: boolean }) => Record<string, unknown> };
        const actor = this.item.actor as unknown as RollDataActor | null;
        const actorRollData = actor?.getRollData({ deterministic }) ?? {};
        return { ...actorRollData, item: this.toObject() };
    }

    /* -------------------------------------------- */
    /*  Helpers                                     */
    /* -------------------------------------------- */

    /**
     * Retrieve the source book reference for this item.
     * @type {string}
     */
    get sourceReference(): string {
        if (typeof this.source === 'string') return this.source;
        const { book, page, custom } = this.source;
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
    /**
     * Generate chat data for this item.
     * @param {object} htmlOptions   Options passed to enrichHTML.
     * @returns {Promise<object>}
     */
    async getChatData(htmlOptions: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
        const description = this.description;
        const descValue = typeof description === 'string' ? description : description.value;
        const data = {
            description: await foundry.applications.ux.TextEditor.implementation.enrichHTML(descValue, {
                ...htmlOptions,
                rollData: this.getRollData(),
            }),
            properties: this.chatProperties,
        };
        return data;
    }

    /**
     * Get labels for the item sheet header.
     * @type {object}
     */
    get headerLabels(): Record<string, unknown> | Array<Record<string, unknown>> {
        return {};
    }
}
