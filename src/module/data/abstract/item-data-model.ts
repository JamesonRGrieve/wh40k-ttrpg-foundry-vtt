/**
 * BOUNDARY-HEAVY FILE: this is the abstract base for every WH40K Foundry V14 Item
 * DataModel. The `_migrateData` / `_cleanData` / `defineSchema` overrides operate on
 * raw `source` payloads from Foundry's V14 cleaning pipeline — those payloads carry
 * no schema until they pass through this very file, so `Record<string, unknown>` is
 * the correct boundary type. Per CLAUDE.md, framework-boundary `Record<string,
 * unknown>` / `unknown` casts are permitted here. New non-boundary helpers MUST be
 * typed normally.
 */
import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import type { WH40KItem } from '../../documents/item.ts';
import { formatSourceLabel } from '../../handlebars/source-label.ts';
import { flattenSourceLineVariants, isPlainObject } from '../../utils/item-variant-utils.ts';
import SystemDataModel from './system-data-model.ts';

const { NumberField } = foundry.data.fields;

/** The source Foundry hands a DataModel's migration and cleaning steps, before any schema applies. */
// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry's DataModel.migrateData / DataModel.cleanData source payload is untyped until the schema validates it
type RawSource = Record<string, unknown>;

/** The declared fields of a schema, as Foundry types `SchemaField#fields`. */
type SchemaFields = foundry.data.fields.DataSchema;

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
    static override _cleanData(source?: RawSource, options?: DataModelV14.CleaningOptions): void {
        super._cleanData(source, options);
        // `DataModel.schema` is typed `SchemaField.Any`, so its `fields` arrive untyped.
        ItemDataModel.#cleanNumericFields(source, this.schema.fields as SchemaFields);
    }

    /**
     * Recursively clean numeric fields in source data.
     * Coerces numeric string values to proper numbers for NumberFields.
     * @param {object} source - The source data object
     * @param {SchemaFields} fields - The schema fields to check
     */
    static #cleanNumericFields(source: RawSource | undefined, fields: SchemaFields, processed = new Set<object>()): void {
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
            else if (field instanceof foundry.data.fields.SchemaField && isPlainObject(value)) {
                ItemDataModel.#cleanNumericFields(value, field.fields as SchemaFields, processed);
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
    static override _migrateData(source: RawSource): void {
        super._migrateData(source);
        ItemDataModel.#migrateImg(source);
        ItemDataModel.#migrateCollections(source);
        // Flatten per-game-line variant containers (e.g. `modifiers: { dh2: {...}, rt: {...} }`)
        // down to the active line's branch so schema validation sees the flat shape
        // `defineSchema()` declares. Without it Foundry's validator strips the unknown
        // line keys and falls back to schema initials: "all zeros" on compendium item
        // sheets for ammunition, weapons, armour and the rest.
        //
        // There is no parent or actor at migration time, so this resolves to the world's
        // primary line. Owned items reach here already resolved to their OWNER's line (no
        // containers left): `WH40KBaseActor.migrateData` on load,
        // `WH40KItem.createDocuments` on create, and the hydrate join re-points
        // compendium-copied content via `resolveOwnedLineContent`.
        flattenSourceLineVariants(source);
    }

    /**
     * Validate and fix img field - ensure valid file extension.
     * @param {object} source  The source data
     */
    static #migrateImg(source: RawSource): void {
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
     * Migrate Array fields to Set (V13 requirement).
     * @param {object} source  The source data
     */
    static #migrateCollections(source: RawSource): void {
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
        return game.i18n.localize(CONFIG.Item.typeLabels[item.type] ?? item.type);
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
    /*  Helpers                                     */
    /* -------------------------------------------- */

    /**
     * Retrieve the source book reference for this item.
     * @type {string}
     */
    get sourceReference(): string {
        return formatSourceLabel(this.source);
    }
}
