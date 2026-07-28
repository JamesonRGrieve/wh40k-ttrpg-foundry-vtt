/**
 * Helpers for summarizing ActiveEffect change data into i18n-friendly
 * `{label, value}` rows for display by the canonical `effect-row.hbs` partial.
 *
 * The shape is deliberately narrow: callers compute a localized label string
 * (typically a characteristic / skill / combat / movement name) and a
 * formatted value string (e.g. `+5`, `×2`, `= 10`). The view layer renders
 * those verbatim, so adding new change-key namespaces only requires extending
 * `getChangeLabel` here — no template changes.
 */

import { capitalize } from '../utils/format.ts';

/** Shape of a raw ActiveEffect change entry as stored on the document. */
/** V14 change types. `mode` is the deprecated numeric spelling of the same thing. */
export type EffectChangeType = 'custom' | 'multiply' | 'add' | 'downgrade' | 'upgrade' | 'override';

export interface EffectChangeRaw {
    key: string;
    value: string | number;
    /**
     * V14+ string form. Preferred — reading the numeric `mode` logs a
     * deprecation on every access and is removed in V16 (#507).
     */
    type?: EffectChangeType | undefined;
    /** Legacy numeric form, still present on world data authored before V14. */
    mode?: number | undefined;
    priority?: number;
}

/** Display-ready change shape consumed by `effect-row.hbs`. */
export interface EffectChangeSummary {
    label: string;
    value: string;
}

interface I18nLike {
    localize: (key: string) => string;
}

function getI18n(): I18nLike {
    // In Vitest / Storybook, `game` may not be initialised; fall back to a
    // pass-through localizer so call sites produce deterministic output.
    if (typeof game !== 'undefined') {
        return game.i18n;
    }
    return { localize: (key: string) => key };
}

/**
 * Resolve a human-readable label for an ActiveEffect change key path.
 *
 * Recognized namespaces:
 *   - `system.characteristics.<name>...`  → `WH40K.Characteristic.<Name>`
 *   - `system.skills.<name>...`           → `WH40K.Skill.<name>`
 *   - `system.combat.<field>...`          → `WH40K.Combat.<Field>`
 *   - `system.movement.<field>...`        → `WH40K.Movement.<Field>`
 *
 * Anything else falls back to the capitalized last path segment so the row
 * still renders something readable. Unknown keys are not an error — they just
 * lose the localization round-trip.
 */
export function getChangeLabel(key: string): string {
    if (!key) return '';
    const parts = key.split('.');
    const i18n = getI18n();

    if (parts[1] === 'characteristics' && parts[2]) {
        return i18n.localize(`WH40K.Characteristic.${capitalize(parts[2])}`);
    }
    if (parts[1] === 'skills' && parts[2]) {
        return i18n.localize(`WH40K.Skill.${parts[2]}`);
    }
    if (parts[1] === 'combat' && parts[2]) {
        return i18n.localize(`WH40K.Combat.${capitalize(parts[2])}`);
    }
    if (parts[1] === 'movement' && parts[2]) {
        return i18n.localize(`WH40K.Movement.${capitalize(parts[2])}`);
    }

    return capitalize(parts[parts.length - 1] ?? '');
}

/**
 * Format a change's numeric value with mode-appropriate prose. Add modes get
 * an explicit sign, multiply gets `×`, override gets `=`, upgrade/downgrade
 * get arrows.
 */
/** Legacy numeric mode → V14 change type. Literals rather than `CONST` so this
 *  helper works in test environments where the Foundry global is absent. */
const LEGACY_MODE_TYPES: Readonly<Record<number, EffectChangeType>> = {
    0: 'custom',
    1: 'multiply',
    2: 'add',
    3: 'downgrade',
    4: 'upgrade',
    5: 'override',
};

/**
 * The change's type, preferring the V14 string over the deprecated numeric mode.
 *
 * Reading `change.mode` logs a Foundry deprecation on EVERY access — five reads
 * per change, once per effect row, on every sheet render — and the accessor is
 * removed in V16. The numeric form is consulted only when `type` is absent,
 * which means legacy world data authored before V14 (#507).
 * @param {EffectChangeRaw} change  One ActiveEffect change row.
 * @returns {EffectChangeType | null}  Its type, or null when neither form is set.
 */
export function changeType(change: EffectChangeRaw): EffectChangeType | null {
    if (typeof change.type === 'string') return change.type;
    if (typeof change.mode === 'number') return LEGACY_MODE_TYPES[change.mode] ?? null;
    return null;
}

/**
 * Format a change's numeric value with type-appropriate prose. Add gets an
 * explicit sign, multiply gets `×`, override gets `=`, upgrade/downgrade arrows.
 * @param {EffectChangeRaw} change  One ActiveEffect change row.
 * @returns {string}  Display string for the effect row.
 */
/** Per-type value rendering. An object lookup rather than a `switch`, which the
 *  lint config prohibits outright. `custom` is absent deliberately — see below. */
const CHANGE_VALUE_FORMATTERS: Readonly<Partial<Record<EffectChangeType, (n: number) => string>>> = {
    add: (n) => (n > 0 ? `+${n}` : `${n}`),
    multiply: (n) => `×${n}`,
    override: (n) => `= ${n}`,
    upgrade: (n) => `↑${n}`,
    downgrade: (n) => `↓${n}`,
};

export function formatChangeValue(change: EffectChangeRaw): string {
    const value = Number(change.value);
    const numeric = Number.isFinite(value) ? value : 0;
    const format = CHANGE_VALUE_FORMATTERS[changeType(change) ?? 'custom'];
    // `custom` (and an unrecognised type) fall through to the raw authored value:
    // a custom change's value is whatever the author wrote, not a number to sign.
    return format === undefined ? `${change.value}` : format(numeric);
}

/**
 * Summarize a single change row to `{label, value}` for the canonical
 * `effect-row.hbs` partial.
 */
export function summarizeChange(change: EffectChangeRaw): EffectChangeSummary {
    return {
        label: getChangeLabel(change.key),
        value: formatChangeValue(change),
    };
}

/** Summarize a list of raw changes. */
export function summarizeChanges(changes: readonly EffectChangeRaw[] | undefined): EffectChangeSummary[] {
    if (changes === undefined || changes.length === 0) return [];
    return changes.map(summarizeChange);
}
