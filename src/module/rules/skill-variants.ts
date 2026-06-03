/**
 * Test variants (#246) — pure rule logic.
 *
 * A test variant is a named sub-test of a skill (e.g. Awareness → Visual /
 * Auditory). When the homebrew-refinements toggle is on and a skill declares
 * variants, the roll picks a variant, and conditional modifiers gate on it: a
 * modifier tagged for a specific variant (an auspex's +20 tagged `Visual`)
 * applies only when that variant is selected; an untagged modifier is universal.
 *
 * Foundry-free so it is unit-testable; the dialog passes the active variant and
 * the homebrew flag (`WH40KSettings.isHomebrew()`).
 */

/** A skill's declared test variant (mirrors the skill DataModel `variants` entry). */
export interface SkillVariant {
    name: string;
    description: string;
}

/**
 * Variants available to the roll dialog: none unless homebrew refinements are on,
 * and blank-named entries are dropped. Returning `[]` is the gate that keeps the
 * variant selector hidden in RAW mode.
 */
export function availableSkillVariants(variants: readonly SkillVariant[] | undefined, isHomebrew: boolean): SkillVariant[] {
    if (!isHomebrew) return [];
    return (variants ?? []).filter((v) => v.name.trim() !== '');
}

/** A modifier that may opt into a specific variant. Empty / absent tag = universal. */
export interface VariantTaggable {
    appliesToVariant?: string | null;
}

/**
 * Whether a modifier applies given the selected variant:
 *  - untagged modifiers always apply (universal);
 *  - when no variant is selected (RAW, or a skill with no variants) nothing is
 *    filtered out — tagged modifiers still apply, matching RAW behaviour;
 *  - otherwise the tag must equal the selected variant.
 */
export function modifierAppliesToVariant(modifier: VariantTaggable, selectedVariant: string | null): boolean {
    const tag = modifier.appliesToVariant;
    if (tag === undefined || tag === null || tag.trim() === '') return true;
    if (selectedVariant === null || selectedVariant === '') return true;
    return tag === selectedVariant;
}

/** Keep only the modifiers that apply to the selected variant. */
export function filterModifiersByVariant<T extends VariantTaggable>(modifiers: readonly T[], selectedVariant: string | null): T[] {
    return modifiers.filter((m) => modifierAppliesToVariant(m, selectedVariant));
}
