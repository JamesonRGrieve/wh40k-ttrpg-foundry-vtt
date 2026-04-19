import SystemDataModel from '../abstract/system-data-model.ts';
import { resolveLineVariant, inferActiveGameLine, isLineVariantContainer } from '../../utils/item-variant-utils.ts';

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
            description: new fields.ObjectField({ required: true, initial: DescriptionTemplate.#emptyDescription() }),
            source: new fields.ObjectField({ required: true, initial: DescriptionTemplate.#emptySource() }),
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
    static _migrateData(source: Record<string, any>): void {
        super._migrateData?.(source);
        DescriptionTemplate.#migrateDescription(source);
        DescriptionTemplate.#migrateSource(source);
    }

    /**
     * Migrate flat description string to object structure.
     * @param {object} source  The source data
     */
    static #migrateDescription(source: Record<string, any>): void {
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
            source.description.chat ??= '';
            source.description.summary ??= '';
        }
    }

    /**
     * Migrate flat source string to object structure.
     * @param {object} source  The source data
     */
    static #migrateSource(source: Record<string, any>): void {
        if (typeof source.source === 'string') {
            source.source = {
                book: '',
                page: '',
                custom: source.source,
            };
        }
        if (isLineVariantContainer(source.source)) return;
        if (source.source && typeof source.source === 'object') {
            source.source.book ??= '';
            source.source.page ??= '';
            source.source.custom ??= '';
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
    static _cleanData(source: Record<string, unknown> | undefined, options): void {
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
    async getEnrichedDescription(): Promise<any> {
        return TextEditor.enrichHTML(this.description.value, {
            secrets: this.parent?.isOwner,
            rollData: this.parent?.getRollData() ?? {},
        });
    }
}
