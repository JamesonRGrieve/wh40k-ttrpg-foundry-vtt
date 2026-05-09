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
    static defineSchema(): Record<string, foundry.data.fields.DataField.Any> {
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
    static _migrateData(source: Record<string, unknown>): void {
        super._migrateData?.(source);
        DescriptionTemplate.#migrateDescription(source);
        DescriptionTemplate.#migrateSource(source);
    }

    /**
     * Migrate flat description string to object structure.
     * @param {object} source  The source data
     */
    static #migrateDescription(source: Record<string, unknown>): void {
        if (typeof source.description === 'string') {
            source.description = {
                value: source.description,
                chat: '',
                summary: '',
            };
        }
        if (isLineVariantContainer(source.description)) return;
        // Ensure sub-fields are not null (V13 HTMLField strictness)
        if (source.description && typeof source.description === 'object') {
            const desc = source.description as Record<string, unknown>;
            desc.chat ??= '';
            desc.summary ??= '';
        }
    }

    /**
     * Migrate flat source string to object structure.
     * @param {object} source  The source data
     */
    static #migrateSource(source: Record<string, unknown>): void {
        if (typeof source.source === 'string') {
            source.source = {
                book: '',
                page: '',
                custom: source.source,
            };
        }
        if (isLineVariantContainer(source.source)) return;
        if (source.source && typeof source.source === 'object') {
            const src = source.source as Record<string, unknown>;
            src.book ??= '';
            src.page ??= '';
            src.custom ??= '';
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
    static _cleanData(source: Record<string, unknown> | undefined, options?: DataModelV14.CleaningOptions): void {
        super._cleanData?.(source, options);
    }

    /** @inheritdoc */
    prepareBaseData(): void {
        super.prepareBaseData();

        const lineKey = inferActiveGameLine(this.parent?._source?.system ?? {}, this.parent);
        const resolvedDescription = resolveLineVariant(this.description, lineKey) as Record<string, unknown>;
        const resolvedSource = resolveLineVariant(this.source, lineKey) as Record<string, unknown>;

        this.description = {
            ...DescriptionTemplate.#emptyDescription(),
            ...(resolvedDescription ?? {}),
        } as { value: string; chat: string; summary: string };
        this.source = {
            ...DescriptionTemplate.#emptySource(),
            ...(resolvedSource ?? {}),
        } as { book: string; page: string; custom: string };
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
    async getEnrichedDescription(): Promise<unknown> {
        return TextEditor.enrichHTML(this.description.value, {
            secrets: this.parent?.isOwner,
            rollData: this.parent?.getRollData() ?? {},
        });
    }
}
