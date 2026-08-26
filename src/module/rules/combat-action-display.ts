/**
 * Render-boundary helpers for combat-action buttons (combat-action-group.hbs).
 *
 * Guards the badge + icon against malformed feeder entries (#245). The action
 * badge shows the action-economy *timing*, and the button must never be
 * iconless. Both were previously derived inline in the template
 * (`{{localize (concat "WH40K.Combat.Actions.Timing." entry.type)}}` /
 * `{{entry.icon}}`), which broke in two ways when a feeder passed an entry whose
 * `type` was a raw Foundry item type (`weapon` / `talent` / `originPath`) rather
 * than a timing value, or an entry with no `icon`:
 *   - the badge concatenated the raw type onto the i18n key, rendering an
 *     unresolved `WH40K.Combat.Actions.Timing.<type>` string verbatim;
 *   - the icon rendered `<i class="fas ">`, i.e. no glyph at all.
 *
 * These pure helpers make both cases structurally impossible: a value that is
 * not one of the known timings yields no badge key, and every button resolves to
 * a real Font Awesome class. Content-agnostic — the timing set is a non-content
 * mechanic enum, and the fallback icons are generic UI glyphs.
 */

/** Action-economy timing values a combat-action badge can display. */
export const COMBAT_ACTION_TIMINGS = ['half', 'full', 'reaction', 'varies', 'half-full'] as const;

export type CombatActionTiming = (typeof COMBAT_ACTION_TIMINGS)[number];

const TIMING_SET: ReadonlySet<string> = new Set(COMBAT_ACTION_TIMINGS);

/** True only for the enumerated action-economy timing values. */
export function isCombatActionTiming(value: string | null | undefined): value is CombatActionTiming {
    return typeof value === 'string' && TIMING_SET.has(value);
}

/**
 * The langpack key for a valid timing badge, or `''` when the value is not a
 * real timing (so the template renders no badge rather than an unresolved key).
 */
export function combatTimingKey(value: string | null | undefined): string {
    return isCombatActionTiming(value) ? `WH40K.Combat.Actions.Timing.${value}` : '';
}

/** Per-timing fallback icon so a combat-action button is never iconless. */
const TIMING_ICON: Readonly<Record<CombatActionTiming, string>> = Object.freeze({
    'half': 'fa-hourglass-half',
    'full': 'fa-hourglass',
    'reaction': 'fa-bolt',
    'varies': 'fa-clock',
    'half-full': 'fa-hourglass-half',
});

/** Fallback when neither an explicit icon nor a recognised timing is available. */
const DEFAULT_ACTION_ICON = 'fa-circle-dot';

/**
 * The Font Awesome class for a combat-action button: the entry's own `icon` when
 * it is a non-empty string, otherwise a per-timing default, otherwise a generic
 * glyph. Never returns an empty string.
 */
export function combatActionIcon(icon: string | null | undefined, timing: string | null | undefined): string {
    if (typeof icon === 'string' && icon.trim() !== '') return icon;
    if (isCombatActionTiming(timing)) return TIMING_ICON[timing];
    return DEFAULT_ACTION_ICON;
}
