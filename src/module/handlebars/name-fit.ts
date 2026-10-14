/**
 * Font-size step for an actor-name `<input>` in the narrow sheet sidebar (#630).
 *
 * A text input cannot wrap, so a long name ("Asphodel Kroot Warrior") was
 * clipped at the base size. The class steps the font down as the name grows,
 * so names up to {@link NAME_FIT_MAX_FITTED_CHARS} characters fit the ~145px
 * sidebar field whole; longer ones take the floor size and end in an ellipsis,
 * with the full name in the input's tooltip.
 *
 * Each step's character budget assumes the sidebar input's content box
 * (~145px) and Signika bold's ~0.45em average glyph advance.
 */
interface NameFitStep {
    readonly maxChars: number;
    readonly className: string;
}

const NAME_FIT_STEPS: readonly NameFitStep[] = [
    { maxChars: 17, className: 'tw-text-[1.05rem]' },
    { maxChars: 21, className: 'tw-text-[0.9rem]' },
    { maxChars: 24, className: 'tw-text-[0.8rem]' },
    { maxChars: 27, className: 'tw-text-[0.7rem]' },
];

/** Longest name that still fits the sidebar field without an ellipsis. */
export const NAME_FIT_MAX_FITTED_CHARS = Math.max(...NAME_FIT_STEPS.map((step) => step.maxChars));

const NAME_FIT_FLOOR_CLASS = 'tw-text-[0.65rem]';

/** Tailwind font-size class that fits `name` into the sidebar name input. */
export function nameFitClass(name: string): string {
    const length = name.trim().length;
    return NAME_FIT_STEPS.find((step) => length <= step.maxChars)?.className ?? NAME_FIT_FLOOR_CLASS;
}
