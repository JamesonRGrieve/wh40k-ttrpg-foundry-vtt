import { resolveLineVariant, inferActiveGameLine, isLineVariantContainer } from '../../utils/item-variant-utils.ts';
import SystemDataModel from '../abstract/system-data-model.ts';

/**
 * Template for items with descriptions and source references.
 * @mixin
 */
export default class DescriptionTemplate extends SystemDataModel {
    // Typed property declarations matching defineSchema()
    declare description: { value: string; chat: string; summary: string };
    declare source: { book: string; page: string; custom: string };

    /** @inheritdoc */
    static override defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
        const fields = foundry.data.fields;
        return {
            description: new fields.SchemaField({
                value: new fields.HTMLField({ required: true, initial: '' }),
                chat: new fields.HTMLField({ required: false, initial: '' }),
                summary: new fields.StringField({ required: false, blank: true, initial: '' }),
            }),
            source: new fields.SchemaField({
                book: new fields.StringField({ required: false, blank: true, initial: '' }),
                page: new fields.StringField({ required: false, blank: true, initial: '' }),
                custom: new fields.StringField({ required: false, blank: true, initial: '' }),
            }),
        };
    }

    /* -------------------------------------------- */
    /*  Data Migration                              */
    /* -------------------------------------------- */

    /**
     * Migrate description and source data.
     * @param {object} source  The source data
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: _migrateData receives raw Foundry document data before schema validation
    static override _migrateData(source: Record<string, unknown>): void {
        super._migrateData(source);
        DescriptionTemplate.#migrateDescription(source);
        DescriptionTemplate.#migrateSource(source);
    }

    /**
     * Migrate flat description string to object structure.
     * @param {object} source  The source data
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: receives raw Foundry document data before schema validation
    static #migrateDescription(source: Record<string, unknown>): void {
        if (typeof source['description'] === 'string') {
            source['description'] = {
                value: source['description'],
                chat: '',
                summary: '',
            };
        }
        if (isLineVariantContainer(source['description'])) return;
        // Ensure sub-fields are not null (V13 HTMLField strictness)
        if (source['description'] !== null && source['description'] !== undefined && typeof source['description'] === 'object') {
            // eslint-disable-next-line no-restricted-syntax -- boundary: sub-field is raw Foundry stored data of unknown shape; ??= permitted in _migrateData to fill missing fields in stored data
            const desc = source['description'] as Record<string, unknown>;
            // eslint-disable-next-line no-restricted-syntax -- ??= is permitted here: this IS the migrateData method setting schema defaults for legacy stored data
            desc['chat'] ??= '';
            // eslint-disable-next-line no-restricted-syntax -- ??= is permitted here: this IS the migrateData method setting schema defaults for legacy stored data
            desc['summary'] ??= '';
        }
    }

    /**
     * Migrate flat source string to object structure.
     * @param {object} source  The source data
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: receives raw Foundry document data before schema validation
    static #migrateSource(source: Record<string, unknown>): void {
        if (typeof source['source'] === 'string') {
            source['source'] = {
                book: '',
                page: '',
                custom: source['source'],
            };
        }
        if (isLineVariantContainer(source['source'])) return;
        if (source['source'] !== null && source['source'] !== undefined && typeof source['source'] === 'object') {
            // eslint-disable-next-line no-restricted-syntax -- boundary: sub-field is raw Foundry stored data of unknown shape; ??= permitted in _migrateData to fill missing fields in stored data
            const src = source['source'] as Record<string, unknown>;
            // eslint-disable-next-line no-restricted-syntax -- ??= is permitted here: this IS the migrateData method setting schema defaults for legacy stored data
            src['book'] ??= '';
            // eslint-disable-next-line no-restricted-syntax -- ??= is permitted here: this IS the migrateData method setting schema defaults for legacy stored data
            src['page'] ??= '';
            // eslint-disable-next-line no-restricted-syntax -- ??= is permitted here: this IS the migrateData method setting schema defaults for legacy stored data
            src['custom'] ??= '';
        }
    }

    static #emptyDescription(): Record<string, string> {
        return {
            value: '',
            chat: '',
            summary: '',
        };
    }

    static #emptySource(): Record<string, string> {
        return {
            book: '',
            page: '',
            custom: '',
        };
    }

    /* -------------------------------------------- */
    /*  Data Cleaning                               */
    /* -------------------------------------------- */

    /**
     * Clean description template data.
     * @param {object} source     The source data
     * @param {object} options    Additional options
     * @protected
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: _cleanData receives raw Foundry document data before schema validation
    static override _cleanData(source: Record<string, unknown> | undefined, options?: DataModelV14.CleaningOptions): void {
        super._cleanData(source, options);
    }

    /** @inheritdoc */
    override prepareBaseData(): void {
        super.prepareBaseData();

        // eslint-disable-next-line no-restricted-syntax -- boundary: parent is a Foundry DataModel/Document with untyped _source backing store
        const parentAny = this.parent as { _source?: { system?: Record<string, unknown> } } | null | undefined;
        // eslint-disable-next-line no-restricted-syntax -- boundary: parent is Foundry Document type (any); actor field is untyped on the base DataModel parent
        const lineKey = inferActiveGameLine(parentAny?._source?.system ?? {}, this.parent as { actor?: unknown } | null | undefined);
        const resolvedDescription = resolveLineVariant(this.description, lineKey);
        const resolvedSource = resolveLineVariant(this.source, lineKey);

        this.description = {
            ...DescriptionTemplate.#emptyDescription(),
            ...resolvedDescription,
        };
        this.source = {
            ...DescriptionTemplate.#emptySource(),
            ...resolvedSource,
        };
    }

    /* -------------------------------------------- */

    /**
     * Get a formatted source reference string.
     * @type {string}
     */
    get sourceReference(): string {
        const { book, page, custom } = this.source;
        if (custom) return custom;
        if (book && page) return `${book}, p.${page}`;
        if (book) return book;
        return '';
    }

    /* -------------------------------------------- */

    /**
     * Get the enriched description for display.
     * @returns {Promise<string>}
     */
    async getEnrichedDescription(): Promise<string> {
        // eslint-disable-next-line no-restricted-syntax -- boundary: parent is typed as DataModel parent (generic Foundry type), isOwner and getRollData are not on the base DataModel type
        const actor = this.parent as { isOwner?: boolean; getRollData?: () => Record<string, unknown> } | null | undefined;
        return foundry.applications.ux.TextEditor.implementation.enrichHTML(this.description.value, {
            secrets: actor?.isOwner,
            rollData: actor?.getRollData?.() ?? {},
        });
    }
}
