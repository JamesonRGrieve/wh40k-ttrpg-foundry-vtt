import { SYSTEM_ID } from '../constants.ts';
import type { I18nKey } from '../types/i18n-keys';

/**
 * One typed table of the system's world and client settings (#712).
 *
 * Each setting is declared once as a {@link SettingEntry}: its key, langpack
 * name and hint, scope, default, runtime type and a guard that accepts a
 * stored value. From the table:
 * - {@link registerSettingTable} is the one registration loop;
 * - {@link readSetting} is the one read path (the one try/catch and default);
 * - {@link readJsonSetting} is the one JSON-string read path;
 * - {@link SettingValueTypes} gives fvtt-types' `SettingConfig` a type per key
 *   (`types/fvtt-config.ts`), so `game.settings.get` is typed everywhere.
 *
 * Adding a setting is one table entry plus its langpack keys.
 */

/** A value Foundry hands back from `game.settings.get`, before a guard narrows it. */
export type StoredSetting = boolean | number | string | object | null | undefined;

/** The runtime type a setting registers with. */
export type SettingCtor = BooleanConstructor | NumberConstructor | StringConstructor | ArrayConstructor | ObjectConstructor;

/** What `SettingConfig` declares for a setting of runtime type `C` and value `V`: an Array or Object setting declares its constructor. */
type SettingStorage<C extends SettingCtor, V> = C extends ArrayConstructor ? ArrayConstructor : C extends ObjectConstructor ? ObjectConstructor : V;

/** The fields every setting declares, as `game.settings.register` takes them. */
interface SettingSpec<K extends string> {
    readonly key: K;
    readonly name: I18nKey;
    readonly hint: I18nKey;
    readonly scope: 'world' | 'client';
    readonly config: boolean;
    /** Present only where the setting states it; absent and `false` register differently. */
    readonly requiresReload?: boolean;
    /** Fired on every client when the value changes. */
    readonly onChange?: () => void;
}

/** One table entry: a setting of runtime type `C` whose accepted values are `V`. */
/** A number setting's slider bounds. */
export interface SettingRange {
    readonly min: number;
    readonly max: number;
    readonly step: number;
}

export interface SettingEntry<K extends string, V extends StoredSetting, C extends SettingCtor> extends SettingSpec<K> {
    readonly type: C;
    readonly default: V;
    readonly choices?: Readonly<Record<string, I18nKey>>;
    readonly range?: SettingRange;
    /** Does the stored value have this setting's shape? A value it rejects reads as the default. */
    readonly accept: (stored: StoredSetting) => stored is V;
    /** Phantom: the type `SettingConfig` declares for the key. */
    readonly storage?: SettingStorage<C, V>;
}

/** A string setting that stores JSON: `parse` validates the parsed value, `empty` is what a blank or broken one reads as. */
export interface JsonSettingEntry<K extends string, P> extends SettingEntry<K, string, StringConstructor> {
    readonly parse: (value: ReturnType<typeof JSON.parse>) => P;
    readonly empty: P;
}

/** Any entry, for the table-wide helpers. */
type AnySettingEntry = SettingEntry<string, StoredSetting, SettingCtor>;

const isBoolean = (stored: StoredSetting): stored is boolean => typeof stored === 'boolean';
const isFiniteNumber = (stored: StoredSetting): stored is number => typeof stored === 'number' && Number.isFinite(stored);
const isString = (stored: StoredSetting): stored is string => typeof stored === 'string';

/** A boolean setting. */
export function booleanSetting<K extends string>(spec: SettingSpec<K> & { default: boolean }): SettingEntry<K, boolean, BooleanConstructor> {
    return { ...spec, type: Boolean, accept: isBoolean };
}

/** A number setting; only a finite number is accepted. */
export function numberSetting<K extends string>(spec: SettingSpec<K> & { default: number; range?: SettingRange }): SettingEntry<K, number, NumberConstructor> {
    return { ...spec, type: Number, accept: isFiniteNumber };
}

/** A free-text setting. */
export function stringSetting<K extends string>(spec: SettingSpec<K> & { default: string }): SettingEntry<K, string, StringConstructor> {
    return { ...spec, type: String, accept: isString };
}

/** A string setting limited to its choices; the value type is the union of the choice keys. */
export function choiceSetting<K extends string, V extends string>(
    spec: SettingSpec<K> & { default: NoInfer<V>; choices: Readonly<Record<V, I18nKey>> },
): SettingEntry<K, V, StringConstructor> {
    const keys: readonly string[] = Object.keys(spec.choices);
    return { ...spec, type: String, accept: (stored): stored is V => typeof stored === 'string' && keys.includes(stored) };
}

/** A string setting holding JSON, read through {@link readJsonSetting}. */
export function jsonSetting<K extends string, P>(
    spec: SettingSpec<K> & { default: string; parse: (value: ReturnType<typeof JSON.parse>) => P; empty: P },
): JsonSettingEntry<K, P> {
    return { ...spec, type: String, accept: isString };
}

/** An Array setting whose stored value `accept` narrows. */
export function arraySetting<K extends string, V extends readonly StoredSetting[]>(
    spec: SettingSpec<K> & { default: V; accept: (stored: StoredSetting) => stored is V },
): SettingEntry<K, V, ArrayConstructor> {
    return { ...spec, type: Array };
}

/** An Object setting whose stored value `accept` narrows. */
export function objectSetting<K extends string, V extends object>(
    spec: SettingSpec<K> & { default: V; accept: (stored: StoredSetting) => stored is V },
): SettingEntry<K, V, ObjectConstructor> {
    return { ...spec, type: Object };
}

/**
 * Read a setting: the stored value when the entry accepts it, else the default.
 * The default also answers before the setting is registered and when `game` is
 * not ready, so DataModel prep can read settings during early boot. This is the
 * one place a setting read is guarded.
 */
export function readSetting<K extends string, V extends StoredSetting, C extends SettingCtor>(entry: SettingEntry<K, V, C>): V {
    let stored: StoredSetting;
    try {
        stored = game.settings.get(SYSTEM_ID, entry.key as SettingKey);
    } catch {
        return entry.default;
    }
    return entry.accept(stored) ? stored : entry.default;
}

/** Write a setting. */
export async function writeSetting<K extends string, V extends StoredSetting, C extends SettingCtor>(entry: SettingEntry<K, V, C>, value: V): Promise<void> {
    await game.settings.set(SYSTEM_ID, entry.key as SettingKey, value as SettingWriteValue);
}

/**
 * Read a JSON-string setting: blank or unreadable JSON reads as the entry's
 * `empty` value, otherwise `parse` validates the parsed value. The one place a
 * setting's JSON is parsed.
 */
export function readJsonSetting<K extends string, P>(entry: JsonSettingEntry<K, P>): P {
    const raw = readSetting(entry);
    if (raw.trim() === '') return entry.empty;
    try {
        return entry.parse(JSON.parse(raw));
    } catch {
        return entry.empty;
    }
}

/** Register every entry of a table, in the table's order. The one registration loop. */
export function registerSettingTable(table: Readonly<Record<string, AnySettingEntry>>): void {
    for (const entry of Object.values(table)) {
        game.settings.register(
            SYSTEM_ID,
            entry.key as SettingKey,
            {
                name: entry.name,
                hint: entry.hint,
                scope: entry.scope,
                config: entry.config,
                type: entry.type,
                default: entry.default,
                ...(entry.requiresReload !== undefined ? { requiresReload: entry.requiresReload } : {}),
                ...(entry.choices !== undefined ? { choices: entry.choices } : {}),
                ...(entry.range !== undefined ? { range: entry.range } : {}),
                ...(entry.onChange !== undefined ? { onChange: entry.onChange } : {}),
            } as SettingRegistration,
        );
    }
}

/** The table's property → setting key map (the old `WH40KSettings.SETTINGS`). */
export function settingKeys<T extends Readonly<Record<string, AnySettingEntry>>>(table: T): { readonly [P in keyof T]: T[P]['key'] } {
    return Object.fromEntries(Object.entries(table).map(([property, entry]) => [property, entry.key])) as { readonly [P in keyof T]: T[P]['key'] };
}

/** The `SettingConfig` entries a table declares: `wh40k-rpg.<key>` → the type `game.settings.get` returns. */
export type SettingValueTypes<T extends Readonly<Record<string, AnySettingEntry>>> = {
    [P in keyof T as `wh40k-rpg.${T[P]['key']}`]: NonNullable<T[P]['storage']>;
};

/** Every system setting key `SettingConfig` declares. */
type SettingKey = foundry.helpers.ClientSettings.KeyFor<'wh40k-rpg'>;
/** The value `game.settings.set` takes for any system key. */
type SettingWriteValue = foundry.helpers.ClientSettings.SettingCreateData<'wh40k-rpg', SettingKey>;
/** The data `game.settings.register` takes for any system key. */
type SettingRegistration = Parameters<typeof game.settings.register<foundry.helpers.ClientSettings.Type, 'wh40k-rpg', SettingKey>>[2];
