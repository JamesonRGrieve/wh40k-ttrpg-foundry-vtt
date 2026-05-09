/**
 * A special string field for dice formula values.
 * Validates that the string is a valid dice formula.
 */
export default class FormulaField extends foundry.data.fields.StringField {
    /** @inheritdoc */
    /* eslint-disable-next-line @typescript-eslint/naming-convention, no-restricted-syntax -- boundary: Foundry DataField static `_defaults` shape */
    static get _defaults(): Record<string, unknown> {
        return foundry.utils.mergeObject(super._defaults, {
            deterministic: false,
        });
    }

    /* -------------------------------------------- */

    /**
     * Is this formula field deterministic (no dice, just math)?
     * @type {boolean}
     */
    deterministic!: boolean;

    /* -------------------------------------------- */

    /** @inheritdoc */
    _validateType(value: string): void {
        if (value === '') return;

        // Attempt to validate as a roll formula
        try {
            const roll = new Roll(value);
            if (this.deterministic && !roll.isDeterministic) {
                throw new Error(`Formula "${value}" must be deterministic`);
            }
        } catch {
            throw new Error(`Invalid formula: ${value}`);
        }
    }

    /* -------------------------------------------- */

    /**
     * Evaluate the formula and return the result.
     * @param {object} data   Roll data for formula evaluation.
     * @returns {number|null}
     */
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry roll-data payload
    /* eslint-disable no-restricted-syntax -- boundary: Foundry roll-data payload + DataField parent/name introspection */
    evaluate(data: Record<string, unknown> = {}): number | null {
        const ctx = this as unknown as { parent?: Record<string, unknown>; name?: string };
        /* eslint-enable no-restricted-syntax */
        const fieldName = ctx.name;
        const value = fieldName !== undefined ? (ctx.parent?.[fieldName] as string | undefined) : undefined;
        if (value === undefined || value === '') return null;

        try {
            const roll = Roll.create(value, data);
            return roll.evaluateSync().total;
        } catch (err) {
            console.warn(`Failed to evaluate formula: ${value}`, err);
            return null;
        }
    }
}
