/**
 * @file Canonical specialization-name composition (SPEC philosophy, #261).
 *
 * The system models specialized content (Weapon Training (Shock), Trade (Armourer),
 * Lore (Forbidden), …) with the SPEC philosophy: a single base item carries a
 * runtime `specialization` parameter, and the display name is composed at render
 * time. The invariant is:
 *
 *   > The base name never carries the specialization. The `specialization` field
 *   > is the sole carrier. The display name is composed exactly once.
 *
 * These helpers are the one place that owns that invariant, so every call site
 * (talent `fullName`, grant creation, origin-path/advancement display) composes
 * identically and the "Name (Spec) (Spec)" doubling cannot recur. They are pure
 * and content-agnostic — no content strings live here.
 */

/** Trailing "(X)" placeholder that base specialized items ship with (e.g. "Weapon Training (X)"). */
const PLACEHOLDER_SUFFIX = /\s*\(X\)\s*$/i;

/** Any trailing parenthetical, used to reduce a contaminated/composite name back to its base. */
const TRAILING_PARENTHETICAL = /\s*\([^)]+\)\s*$/;

/**
 * Reduce a (possibly contaminated) item name to its bare base — strips a trailing
 * parenthetical such as the "(X)" placeholder or a baked-in "(Specialization)".
 * Use this when STORING a specialized item's name so the base never carries the spec.
 *
 * @param name Raw item name.
 * @returns The base name with any trailing parenthetical removed.
 */
export function stripSpecializationSuffix(name: string): string {
    return name.replace(TRAILING_PARENTHETICAL, '').trim();
}

/**
 * Compose a display name from a base name + specialization, exactly once.
 * Strips the "(X)" placeholder and refuses to re-append a specialization the name
 * already carries (so legacy/contaminated names don't double).
 *
 * @param baseName       The item's base name (ideally already bare).
 * @param specialization The specialization parameter, or empty/nullish for none.
 * @returns The composed display name.
 */
export function composeSpecializationName(baseName: string, specialization: string | null | undefined): string {
    const base = baseName.trim();
    if (specialization === null || specialization === undefined || specialization === '') return base;
    const stripped = base.replace(PLACEHOLDER_SUFFIX, '').trim();
    return stripped.includes(`(${specialization})`) ? stripped : `${stripped} (${specialization})`;
}

/** Splits a trailing "(Specialization)" off a full name. The capturing inverse of {@link composeSpecializationName}. */
const SKILL_NAME_WITH_SPEC = /^(.+?)\s*\((.+?)\)\s*$/;

/**
 * Decompose a full skill/item name into its base name and (optional) specialization —
 * the parse counterpart to {@link composeSpecializationName}. Pure and content-agnostic;
 * the single owner of the "Name (Spec)" parse regex so callers don't re-derive it.
 *
 * @param fullName Full name, e.g. "Common Lore (Imperium)" or "Awareness".
 * @returns `{ name, specialization }` — `specialization` is `null` when the name carries none.
 *
 * @example
 * parseSpecializationName("Common Lore (Imperium)") // → { name: "Common Lore", specialization: "Imperium" }
 * parseSpecializationName("Awareness")              // → { name: "Awareness", specialization: null }
 */
export function parseSpecializationName(fullName: string): { name: string; specialization: string | null } {
    if (fullName === '') return { name: '', specialization: null };

    const match = fullName.match(SKILL_NAME_WITH_SPEC);
    const base = match?.[1];
    const spec = match?.[2];
    if (base !== undefined && spec !== undefined) {
        return { name: base.trim(), specialization: spec.trim() };
    }

    return { name: fullName.trim(), specialization: null };
}
