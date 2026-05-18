/**
 * @file Category → icon / colour lookup tables for the Handlebars helpers.
 *
 * talentIcon / traitIcon / traitCategoryColor / tierColor were four
 * `const table = {…}; return table[key] ?? fallback;` helpers. The tables are
 * keyed by content-agnostic presentation categories (combat / social /
 * creature / elite / tier number), not per-content names, so they live in
 * code rather than a compendium. `lookupOr` is the shared accessor.
 */

/** Table accessor: value for `key`, else `fallback`. */
export function lookupOr<K extends string | number>(table: Partial<Record<K, string>>, key: K, fallback: string): string {
    return table[key] ?? fallback;
}

/** Talent category → Font Awesome icon. */
export const TALENT_ICONS: Partial<Record<string, string>> = {
    combat: 'fa-sword',
    social: 'fa-users',
    knowledge: 'fa-book',
    leadership: 'fa-crown',
    psychic: 'fa-brain',
    technical: 'fa-cog',
    defense: 'fa-shield-alt',
    willpower: 'fa-fist-raised',
    movement: 'fa-running',
    unique: 'fa-star',
    general: 'fa-circle',
};

/** Talent tier (0–3) → colour class. */
export const TIER_COLORS: Partial<Record<number, string>> = {
    1: 'tier-bronze',
    2: 'tier-silver',
    3: 'tier-gold',
    0: 'tier-none',
};

/** Trait category → Font Awesome icon. */
export const TRAIT_ICONS: Record<string, string> = {
    creature: 'fa-paw',
    character: 'fa-user-shield',
    elite: 'fa-star',
    unique: 'fa-gem',
    origin: 'fa-route',
    general: 'fa-shield-alt',
};

/** Trait category → colour class. */
export const TRAIT_CATEGORY_COLORS: Record<string, string> = {
    creature: 'trait-creature',
    character: 'trait-character',
    elite: 'trait-elite',
    unique: 'trait-unique',
    origin: 'trait-origin',
    general: 'trait-general',
};
