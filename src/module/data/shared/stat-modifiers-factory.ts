/**
 * @file Shared stat-modifier factory (#346)
 * Single-sources the "keyed numeric modifier block" pattern shared by the ship
 * and vehicle stat-modifier templates: the `modifiers` SchemaField builder plus
 * the `hasModifiers` / `modifiersList` derivations. The two templates differed
 * only by their key array, their i18n prefix, and whether the rendered list
 * carries a signed `formatted` string (vehicle does; ship does not). This
 * factory captures all three as parameters so the behaviour of each template is
 * preserved exactly while the logic lives in one place.
 */
import { capitalize, formatSigned } from '../../utils/format.ts';

/** One rendered, non-zero stat modifier for display. */
export interface StatModifierEntry {
    key: string;
    label: string;
    value: number;
}

/** A rendered modifier that also carries a signed display string (`+2` / `-1`). */
export interface FormattedStatModifierEntry extends StatModifierEntry {
    formatted: string;
}

/** The schema + pure-helper surface a stat-modifier template re-exports. */
export interface StatModifiersHelpers<K extends string, E extends StatModifierEntry> {
    /** Build the keyed numeric `modifiers` SchemaField (one NumberField per key). */
    schema: () => foundry.data.fields.SchemaField.Any;
    /** Has any non-zero modifier? */
    hasModifiers: (modifiers: Record<K, number>) => boolean;
    /** The non-zero modifiers as a localized display list. */
    modifiersList: (modifiers: Record<K, number>) => E[];
}

/**
 * Build the shared schema + helper surface for a keyed stat-modifier block.
 * `i18nPrefix` is the label namespace (e.g. `WH40K.ShipStat`); the localized key
 * is `${i18nPrefix}.${capitalize(key)}`. With `includeFormatted: true` the list
 * entries also carry a signed `formatted` string via {@link formatSigned}.
 */
export function makeStatModifiers<K extends string>(
    keys: readonly K[],
    i18nPrefix: string,
    options: { includeFormatted: true },
): StatModifiersHelpers<K, FormattedStatModifierEntry>;
export function makeStatModifiers<K extends string>(
    keys: readonly K[],
    i18nPrefix: string,
    options?: { includeFormatted?: false },
): StatModifiersHelpers<K, StatModifierEntry>;
export function makeStatModifiers<K extends string>(
    keys: readonly K[],
    i18nPrefix: string,
    options: { includeFormatted?: boolean } = {},
): StatModifiersHelpers<K, StatModifierEntry | FormattedStatModifierEntry> {
    const { includeFormatted = false } = options;
    return {
        schema(): foundry.data.fields.SchemaField.Any {
            const fields = foundry.data.fields;
            const block: Record<string, foundry.data.fields.DataField.Any> = {};
            for (const key of keys) {
                block[key] = new fields.NumberField({ required: true, initial: 0, integer: true });
            }
            return new fields.SchemaField(block);
        },
        hasModifiers(modifiers: Record<K, number>): boolean {
            return Object.values(modifiers).some((v) => v !== 0);
        },
        modifiersList(modifiers: Record<K, number>): (StatModifierEntry | FormattedStatModifierEntry)[] {
            const list: (StatModifierEntry | FormattedStatModifierEntry)[] = [];
            for (const key of Object.keys(modifiers) as K[]) {
                const value = modifiers[key];
                if (value === 0) continue;
                const label = game.i18n.localize(`${i18nPrefix}.${capitalize(key)}`);
                if (includeFormatted) {
                    list.push({ key, label, value, formatted: formatSigned(value) });
                } else {
                    list.push({ key, label, value });
                }
            }
            return list;
        },
    };
}
