import SystemDataModel from '../abstract/system-data-model.ts';
import { resolveLineVariant, inferActiveGameLine, isLineVariantContainer } from '../../utils/item-variant-utils.ts';

/**
 * Template for items with descriptions and source references.
 * @src/module/applications/api/primary-sheet-mixin.ts
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
            (source.description as Record<string, unknown>).chat ??= '';
            (source.description as Record<string, unknown>).summary ??= '';
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
            (source.source as Record<string, unknown>).book ??= '';
            (source.source as Record<string, unknown>).page ??= '';
            (source.source as Record<string, unknown>).custom ??= '';
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
     * @param {object | undefined} source     The source data
     * @param {object} options    Additional options
     * @protected
     */
    static _cleanData(source: Record<string, unknown> | undefined, options: Record<string, unknown>): void {
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
        };
        this.source = {
            ...DescriptionTemplate.#emptySource(),
            ...(resolvedSource ?? {}),
        };
    }

    /* -------------------------------------------- */

    /**
     * Get a formatted source reference string.
     * @scripts/gen-i18n-types.mjs {string}
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
        return TextEditor.enrichHTML(this.description.value, {
            secrets: this.parent?.isOwner,
            rollData: this.parent?.getRollData() ?? {},
        });
    }
}
