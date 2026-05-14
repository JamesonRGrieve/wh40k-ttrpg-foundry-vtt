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

/** Shape of a raw ActiveEffect change entry as stored on the document. */
export interface EffectChangeRaw {
    key: string;
    value: string | number;
    mode: number;
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

function capitalize(s: string): string {
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
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
export function formatChangeValue(change: EffectChangeRaw): string {
    const value = Number(change.value);
    const numeric = Number.isFinite(value) ? value : 0;
    // CONST is provided by Foundry. Use literal mode codes so this helper
    // works in test environments where `CONST` is absent.
    // 0=CUSTOM, 1=MULTIPLY, 2=ADD, 3=DOWNGRADE, 4=UPGRADE, 5=OVERRIDE
    switch (change.mode) {
        case 2: // ADD
            return numeric > 0 ? `+${numeric}` : `${numeric}`;
        case 1: // MULTIPLY
            return `×${numeric}`;
        case 5: // OVERRIDE
            return `= ${numeric}`;
        case 4: // UPGRADE
            return `↑${numeric}`;
        case 3: // DOWNGRADE
            return `↓${numeric}`;
        default:
            return `${change.value}`;
    }
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
