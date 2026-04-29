/**
 * A special string field for unique identifiers.
 * Used for referencing items in compendiums and linking data.
 *
 * Follows DND5E pattern: permissive validation (accepts legacy formats)
 * but provides helper for generating kebab-case from names.
 */
// Extend via `any` access to bypass fvtt-types AnyDataField private-brand mismatch.
// Instances of IdentifierField are structurally incompatible with DataField.Any when
// the base is referenced through the typed namespace because StringField's #assignmentType
// brand doesn't widen to `any`. Using an `any` base makes the subclass brand-free,
// which satisfies DataField.Any at call sites. The runtime class is still StringField.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default class IdentifierField extends (foundry.data as any).fields.StringField {
    /** @inheritdoc */
    static get _defaults() {
        return foundry.utils.mergeObject(super._defaults, {
            nullable: false,
            blank: true,
            textSearch: true,
        });
    }

    /* -------------------------------------------- */

    /** @inheritdoc */
    protected override _validateType(value: string): void {
        if (value === '') return;

        // Permissive validation - allows letters (any case), numbers, underscores, and hyphens
        // This matches DND5E pattern and accepts legacy camelCase identifiers
        if (!/^[a-z0-9_-]+$/i.test(value)) {
            throw new Error(`Identifier "${value}" must contain only letters, numbers, underscores, and hyphens`);
        }
    }

    /* -------------------------------------------- */

    /**
     * Generate an identifier from a name string.
     * Produces kebab-case for new identifiers.
     * @param {string} name   The name to convert.
     * @returns {string}
     */
    static fromName(name: string): string {
        return name
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    }
}
