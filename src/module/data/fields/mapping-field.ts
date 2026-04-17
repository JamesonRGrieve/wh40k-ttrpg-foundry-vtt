/**
 * A special ObjectField for mapping data.
 * Similar to DnD5e's MappingField for handling object-based data.
 */
export default class MappingField extends foundry.data.fields.ObjectField {
    model: foundry.data.fields.DataField.Any;
    initialKeys: string[] | null;
    initialKeysOnly: boolean;

    /**
     * @param {DataField} model         The data field type for each mapped value.
     * @param {object} [options={}]     Field options.
     * @param {string[]} [options.initialKeys]   Initial keys to populate.
     * @param {boolean} [options.initialKeysOnly]   Only allow initial keys.
     */
    constructor(model: foundry.data.fields.DataField.Any, options: Record<string, unknown> = {}) {
        super(options);
        this.model = model;
        this.initialKeys = (options.initialKeys as string[]) ?? null;
        this.initialKeysOnly = (options.initialKeysOnly as boolean) ?? false;
    }

    /* -------------------------------------------- */

    /** @inheritdoc */
    _cleanType(value: Record<string, unknown>, options: Record<string, unknown> = {}): Record<string, unknown> {
        const cleaned = super._cleanType(value, options) as Record<string, unknown>;

        // Clean each mapped value
        for (const [key, v] of Object.entries(cleaned)) {
            if (this.model instanceof (foundry.data.fields as any).DataField) {
                cleaned[key] = this.model.clean(v as any, options);
            }
        }

        return cleaned;
    }

    /* -------------------------------------------- */

    /** @inheritdoc */
    initialize(value: Record<string, unknown>, model: unknown, options: Record<string, unknown> = {}): Record<string, unknown> {
        if (!value) return {};

        const initialized: Record<string, unknown> = {};
        for (const [key, v] of Object.entries(value)) {
            if (this.model instanceof (foundry.data.fields as any).SchemaField) {
                initialized[key] = (this.model as any).initialize(v, model, options);
            } else if (this.model instanceof (foundry.data.fields as any).DataField) {
                initialized[key] = (this.model as any).initialize(v, model, options);
            } else {
                initialized[key] = v;
            }
        }

        return initialized;
    }

    /* -------------------------------------------- */

    /** @inheritdoc */
    _validateType(value: unknown, options: Record<string, unknown> = {}): void {
        if (foundry.utils.getType(value) !== 'Object') {
            throw new Error('Value must be an object');
        }

        const errors: string[] = [];
        for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
            if (this.initialKeysOnly && this.initialKeys && !this.initialKeys.includes(key)) {
                errors.push(`Key "${key}" is not allowed`);
                continue;
            }

            try {
                if (this.model instanceof (foundry.data.fields as any).DataField) {
                    this.model.validate(v, options);
                }
            } catch (err) {
                errors.push(`${key}: ${(err as Error).message}`);
            }
        }

        if (errors.length) {
            throw new Error(errors.join('; '));
        }
    }
}
