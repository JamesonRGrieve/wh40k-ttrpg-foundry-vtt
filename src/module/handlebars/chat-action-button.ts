/**
 * @file chat-action-button — the one class string every chat-card action button
 * (Roll Damage, Assign Damage, Replace Die with DoS, Refund, +1 DoS, the evasion
 * row…) is built from, as the `chatActionButton` Handlebars helper.
 *
 * The rows once copied the same ~20-class string per button, each with
 * `tw-whitespace-nowrap` and no `tw-min-w-0`, so a long uppercase label ("REPLACE
 * DIE WITH DOS (10)") pushed its button past both edges of the chat card. Here a
 * button may shrink (`tw-min-w-0`) and its label wraps, centred; the palette is a
 * named tone and the padding / type size a named size. A caller adds only its
 * `roll-control__*` hook and its flex sizing (`tw-flex-1`, `tw-w-full`).
 *
 * The classes are string literals in this module, which Tailwind's content scan
 * (`./src/module/**`) reads, so they need no safelist.
 */

/** Layout and type every action button shares: shrinkable, label wrapped and centred. */
const BASE =
    'tw-flex tw-items-center tw-justify-center tw-gap-1.5 tw-min-w-0 tw-text-center tw-leading-tight tw-border tw-rounded-md tw-font-semibold tw-uppercase tw-tracking-[0.05em] tw-transition-all';

/** A pressable button lifts on hover; a disabled one dims. */
const PRESSABLE =
    'tw-cursor-pointer hover:-tw-translate-y-px active:tw-translate-y-0 disabled:tw-opacity-40 disabled:tw-cursor-not-allowed disabled:hover:tw-translate-y-0';

/** Padding and type size: `md` for a row's main action, `sm` for the compact secondary row. */
const SIZES = {
    md: 'tw-px-3 tw-py-2 tw-text-[0.8rem]',
    sm: 'tw-px-2 tw-py-[5px] tw-text-[0.7rem]',
} as const;

/** The palettes the cards use. `inert` is a placeholder that looks disabled and is not pressable. */
const TONES = {
    wounds: `${PRESSABLE} tw-bg-[var(--wh40k-wounds-bg)] tw-border-[var(--wh40k-wounds-border)] tw-text-[color:var(--wh40k-wounds-secondary)] hover:tw-bg-[rgba(139,0,0,0.2)] hover:tw-border-[var(--wh40k-wounds-primary)] hover:tw-shadow-[0_0_12px_rgba(139,0,0,0.4)]`,
    powers: `${PRESSABLE} tw-bg-[var(--wh40k-powers-bg)] tw-border-[var(--wh40k-powers-border)] tw-text-[color:var(--wh40k-powers-secondary)] hover:tw-bg-[rgba(106,32,144,0.2)] hover:tw-border-[var(--wh40k-powers-primary)] hover:tw-shadow-[0_0_12px_rgba(106,32,144,0.4)]`,
    gold: `${PRESSABLE} tw-bg-[var(--wh40k-btn-bg)] tw-border-[var(--wh40k-border-color)] tw-text-[color:var(--wh40k-card-gold)] hover:tw-bg-[var(--wh40k-btn-bg-hover)] hover:tw-border-gold hover:tw-shadow-[0_0_12px_var(--wh40k-gold-glow)]`,
    brass: `${PRESSABLE} tw-bg-[rgba(201,162,39,0.12)] tw-border-gold tw-text-[color:var(--wh40k-card-gold)] hover:tw-bg-[rgba(201,162,39,0.22)] hover:tw-shadow-[0_0_12px_rgba(201,162,39,0.35)]`,
    amber: `${PRESSABLE} tw-bg-amber-500/20 tw-border-[var(--wh40k-card-gold)] tw-text-[color:var(--wh40k-card-gold)] hover:tw-bg-amber-500/30 hover:tw-shadow-[0_0_12px_rgba(255,191,0,0.4)]`,
    slate: `${PRESSABLE} tw-bg-slate-700/40 tw-border-slate-500 tw-text-slate-100 hover:tw-bg-slate-600/60`,
    shadow: `${PRESSABLE} tw-bg-gray-800/60 tw-border-gray-700 tw-text-gray-100 hover:tw-bg-gray-800/80 hover:tw-border-gray-500 hover:tw-shadow-[0_0_12px_rgba(0,0,0,0.6)]`,
    inert: 'tw-cursor-not-allowed tw-opacity-40 tw-bg-[var(--wh40k-btn-bg)] tw-border-[var(--wh40k-border-color)] tw-text-[color:var(--wh40k-card-gold)]',
} as const;

type ChatActionTone = keyof typeof TONES;
type ChatActionSize = keyof typeof SIZES;

function isTone(value: string): value is ChatActionTone {
    return Object.hasOwn(TONES, value);
}

function isSize(value: string): value is ChatActionSize {
    return Object.hasOwn(SIZES, value);
}

/**
 * The class string for a chat-card action button of `tone` at `size`. An unknown
 * tone or size is a template bug, so it throws rather than render an unstyled button.
 */
export function chatActionButtonClass(tone: string, size: string = 'md'): string {
    if (!isTone(tone)) throw new Error(`chatActionButton: unknown tone "${tone}"`);
    if (!isSize(size)) throw new Error(`chatActionButton: unknown size "${size}"`);
    return `${BASE} ${SIZES[size]} ${TONES[tone]}`;
}
