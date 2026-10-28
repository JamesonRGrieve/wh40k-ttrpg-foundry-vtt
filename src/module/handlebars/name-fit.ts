/**
 * Font-size step for a name `<input>` that has to fit its field (#630, #699).
 *
 * A text input cannot wrap, so a long name was clipped at the base size, mid-letter
 * ("E2E-612 WEAPONMODIFICATIO"). The class steps the font down as the name grows, so
 * names up to a field's longest fitted length show whole; longer ones take the floor
 * size and end in an ellipsis, with the full name in the input's tooltip.
 *
 * Each field has its own steps:
 * - `sidebar`: the actor sheet's ~145px sidebar field, Signika bold at ~0.45em per
 *   glyph.
 * - `itemHeader`: the item sheet header's ~360px title, the display face (small
 *   caps) at ~0.6em per glyph, starting from `text-xl`.
 */
interface NameFitStep {
    readonly maxChars: number;
    readonly className: string;
}

interface NameFitProfile {
    readonly steps: readonly NameFitStep[];
    readonly floorClass: string;
}

const NAME_FIT_PROFILES = {
    sidebar: {
        steps: [
            { maxChars: 17, className: 'tw-text-[1.05rem]' },
            { maxChars: 21, className: 'tw-text-[0.9rem]' },
            { maxChars: 24, className: 'tw-text-[0.8rem]' },
            { maxChars: 27, className: 'tw-text-[0.7rem]' },
        ],
        floorClass: 'tw-text-[0.65rem]',
    },
    itemHeader: {
        steps: [
            { maxChars: 22, className: 'tw-text-xl' },
            { maxChars: 26, className: 'tw-text-[1.1rem]' },
            { maxChars: 30, className: 'tw-text-[0.95rem]' },
            { maxChars: 36, className: 'tw-text-[0.8rem]' },
        ],
        floorClass: 'tw-text-[0.75rem]',
    },
    qualityTile: {
        // The weapon header's quality tile: ~68px of text that wraps at spaces over
        // two lines, so a long single word ("Hallucinogenic") must fit one line.
        steps: [
            { maxChars: 10, className: 'tw-text-[0.7rem]' },
            { maxChars: 14, className: 'tw-text-[0.62rem]' },
        ],
        floorClass: 'tw-text-[0.55rem]',
    },
} as const satisfies Record<string, NameFitProfile>;

type NameFitField = keyof typeof NAME_FIT_PROFILES;

function isNameFitField(value: string): value is NameFitField {
    return Object.hasOwn(NAME_FIT_PROFILES, value);
}

/** Longest name that still fits the sidebar field without an ellipsis. */
export const NAME_FIT_MAX_FITTED_CHARS = Math.max(...NAME_FIT_PROFILES.sidebar.steps.map((step) => step.maxChars));

/** Longest name that still fits the item header without an ellipsis. */
export const ITEM_NAME_FIT_MAX_FITTED_CHARS = Math.max(...NAME_FIT_PROFILES.itemHeader.steps.map((step) => step.maxChars));

/**
 * Tailwind font-size class that fits `name` into `field`'s name input. An unknown
 * field is a template bug, so it throws rather than render an unfitted name.
 */
export function nameFitClass(name: string, field: string = 'sidebar'): string {
    if (!isNameFitField(field)) throw new Error(`nameFitClass: unknown field "${field}"`);
    const profile: NameFitProfile = NAME_FIT_PROFILES[field];
    const length = name.trim().length;
    return profile.steps.find((step) => length <= step.maxChars)?.className ?? profile.floorClass;
}
