/**
 * The four canonical DH2 damage types (core.md §"Critical Damage",
 * Tables 7–7 … 7–22). The type of damage selects which Critical Effects
 * table a Critical-damage overflow is resolved on.
 */
export type CanonicalDamageType = 'Energy' | 'Explosive' | 'Impact' | 'Rending';

/**
 * The four Critical Effects table body-parts. The six hit locations
 * (Head, Right/Left Arm, Body, Right/Left Leg) collapse onto these:
 * the RAW tables are keyed by Arm / Body / Head / Leg, not by side.
 */
export type CanonicalBodyPart = 'Arm' | 'Body' | 'Head' | 'Leg';

const CANONICAL_DAMAGE_TYPES: ReadonlyArray<CanonicalDamageType> = ['Energy', 'Explosive', 'Impact', 'Rending'];

/**
 * Normalise a free-form damage-type string (any casing, possibly an
 * abbreviation) to one of the four canonical types. Returns null when
 * the input does not resolve — callers fall back to Impact per
 * core.md L10646 ("If a source of damage does not specify a type,
 * treat it as Impact.").
 */
export function normalizeDamageType(value: string | null | undefined): CanonicalDamageType | null {
    if (typeof value !== 'string' || value === '') return null;
    const upper = value.trim().toUpperCase();
    for (const dt of CANONICAL_DAMAGE_TYPES) {
        if (dt.toUpperCase() === upper) return dt;
    }
    return null;
}

/**
 * Collapse a hit location ('Head', 'Right Arm', 'Left Leg', …) onto the
 * Critical Effects table body-part it shares. Side prefixes are
 * stripped. Returns null when the input does not resolve.
 */
export function normalizeBodyPart(value: string | null | undefined): CanonicalBodyPart | null {
    if (typeof value !== 'string' || value === '') return null;
    const upper = value.trim().toUpperCase();
    if (upper.includes('HEAD')) return 'Head';
    if (upper.includes('ARM') || upper.includes('HAND')) return 'Arm';
    if (upper.includes('LEG') || upper.includes('FOOT')) return 'Leg';
    if (upper.includes('BODY') || upper.includes('TORSO') || upper.includes('CHEST')) return 'Body';
    return null;
}

export function damageTypeDropdown(): Record<string, string> {
    const dropdown: Record<string, string> = {};
    damageType().forEach((i) => {
        dropdown[i.name] = i.name;
    });
    return dropdown;
}

export function damageTypeNames(): string[] {
    return damageType().map((i) => i.name);
}

export function damageType(): { name: string }[] {
    return [
        {
            name: 'Energy',
        },
        {
            name: 'Explosive',
        },
        {
            name: 'Impact',
        },
        {
            name: 'Rending',
        },
    ];
}
