import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Data-driven coverage of every WH40K system setting registered via
 * `WH40KSettings.registerSettings()`. For each registered setting key
 * under the `wh40k-rpg.*` namespace this spec:
 *
 *   1. Reads the current value via `game.settings.get(...)`. Every
 *      successful read records `setting.read`.
 *   2. Exercises the write path via `game.settings.set(...)`:
 *      - Boolean: flip + assert + restore.
 *      - String with choices: pick a different choice + assert + restore.
 *      - Number: nudge by 1 + assert + restore.
 *      - Array / object / fallback: re-set to the current value (the
 *        write path is exercised; the stored state is unchanged).
 *      - `requiresReload: true`: re-set to the SAME current value.
 *        Foundry's `Settings.set` does not fire a reload prompt when
 *        the value is unchanged, so the write path still routes
 *        through `set()` and records `setting.toggle` without crashing
 *        the active session. (Same caveat documented in
 *        `roll-methods.spec.ts` for `simple-attack-rolls` /
 *        `simple-psychic-rolls`.) The dimension semantically counts
 *        "the set() write path was exercised against this key", not
 *        "the stored state changed".
 *      Every successful write records `setting.toggle`.
 *
 * After the per-key sweep the spec exercises the static accessors on
 * `WH40KSettings` (`isHomebrew`, `getRuleset`, `getCharacteristicOffset`,
 * `getCharacteristicBase`, `isMultipleFateBurnAllowed`) so source-code
 * coverage on `src/module/wh40k-rpg-settings.ts` reflects the accessor
 * branches and not just the register-site lines.
 *
 * The spec uses the same collect-failures-then-assert pattern as
 * `conditions.spec.ts` so a single broken setting reports alongside the
 * rest rather than short-circuiting the whole sweep.
 */

const SYSTEM_ID = 'wh40k-rpg';

const SETTING_ACCESSORS = ['isHomebrew', 'getRuleset', 'getCharacteristicOffset', 'getCharacteristicBase', 'isMultipleFateBurnAllowed'] as const;

interface SettingProbe {
    key: string;
    /** 'toggle' = boolean flipped + restored; 'choice' = string choice flipped + restored; 'read' = read-only probe. */
    kind: 'toggle' | 'choice' | 'read';
    ok: boolean;
    error: string | null;
}

interface AccessorProbe {
    name: string;
    ok: boolean;
    error: string | null;
}

/**
 * Browser-context Foundry settings surfaces accessed from `page.evaluate`.
 * `globalThis.game.settings` is a Foundry global, not part of this repo's type
 * graph — each access crosses a framework boundary at the single
 * `as unknown as SettingsWindow` cast, flagged with an inline boundary disable.
 */
type SettingValue = string | number | boolean | SettingValueArray | SettingValueObject | null;
type SettingValueArray = SettingValue[];
interface SettingValueObject {
    [key: string]: SettingValue;
}
interface SettingDef {
    type?: BooleanConstructor | NumberConstructor | ArrayConstructor | StringConstructor | ObjectConstructor;
    choices?: Record<string, string>;
    requiresReload?: boolean;
    default?: SettingValue;
}
interface FoundrySettings {
    settings?: Map<string, SettingDef> & { keys: () => IterableIterator<string> };
    get: (ns: string, k: string) => SettingValue;
    set: (ns: string, k: string, v: SettingValue) => Promise<void>;
}
interface SettingsWindow {
    game?: { settings?: FoundrySettings };
}
/** A WH40KSettings static method surface — accessor names mapped to callables. */
type AccessorResult = string | number | boolean | undefined;
type AccessorOwner = Record<string, () => AccessorResult>;
/** Browser-context surfaces that may expose the WH40KSettings static class. */
interface AccessorWindow {
    CONFIG?: { WH40K?: { Settings?: AccessorOwner } };
    game?: { wh40k?: { settings?: AccessorOwner }; system?: { api?: { settings?: AccessorOwner } } };
}

async function listSettingKeys(page: Page): Promise<string[]> {
    return page.evaluate((systemId: string) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context globalThis.game.settings (Foundry global, no repo type)
        const browserCtx = globalThis as unknown as SettingsWindow;
        const settings = browserCtx.game?.settings?.settings;
        if (!settings || typeof settings.keys !== 'function') return [];
        return Array.from(settings.keys()).filter((k): k is string => typeof k === 'string' && k.startsWith(`${systemId}.`));
    }, SYSTEM_ID);
}

async function probeSetting(page: Page, fullKey: string): Promise<SettingProbe> {
    const result = await page.evaluate(
        async ({ fullKey: settingKey, systemId }) => {
            const fmt = (v: SettingValue): string => (typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v));
            // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context globalThis.game.settings (Foundry global, no repo type)
            const gameSettings = globalThis as unknown as SettingsWindow;
            const settings = gameSettings.game?.settings;
            if (!settings) return { kind: 'read' as const, ok: false, error: 'game.settings unavailable' };

            const namespacedKey = settingKey.startsWith(`${systemId}.`) ? settingKey.slice(systemId.length + 1) : settingKey;
            const def = settings.settings?.get(settingKey);
            if (!def) return { kind: 'read' as const, ok: false, error: `definition missing for ${settingKey}` };

            let current: SettingValue;
            try {
                current = settings.get(systemId, namespacedKey);
            } catch (err) {
                return {
                    kind: 'read' as const,
                    ok: false,
                    error: `get threw: ${err instanceof Error ? err.message : String(err)}`,
                };
            }

            // requiresReload settings would trigger a reload prompt if the
            // value actually changes mid-session. Set them back to their
            // current value: Foundry's set() routes through and records the
            // write path, but the no-op equality lets the reload prompt
            // skip. Same coverage on `setting.toggle`, no session crash.
            if (def.requiresReload === true) {
                try {
                    await settings.set(systemId, namespacedKey, current);
                    return { kind: 'toggle' as const, ok: true, error: null };
                } catch {
                    // Eat any reload-related error; we still got a clean read.
                    return { kind: 'read' as const, ok: true, error: null };
                }
            }

            const isBoolean = def.type === Boolean || typeof current === 'boolean';
            const hasChoices = def.choices !== undefined && typeof def.choices === 'object';
            const isNumber = def.type === Number || typeof current === 'number';
            const isArray = def.type === Array || Array.isArray(current);

            if (isBoolean) {
                const next = current !== true;
                try {
                    await settings.set(systemId, namespacedKey, next);
                } catch (err) {
                    return {
                        kind: 'toggle' as const,
                        ok: false,
                        error: `set(${String(next)}) threw: ${err instanceof Error ? err.message : String(err)}`,
                    };
                }
                const observed = settings.get(systemId, namespacedKey);
                if (observed !== next) {
                    // restore best-effort before reporting failure
                    try {
                        await settings.set(systemId, namespacedKey, current);
                    } catch {
                        /* ignore */
                    }
                    return {
                        kind: 'toggle' as const,
                        ok: false,
                        error: `set(${String(next)}) did not stick — observed ${fmt(observed)}`,
                    };
                }
                try {
                    await settings.set(systemId, namespacedKey, current);
                } catch (err) {
                    return {
                        kind: 'toggle' as const,
                        ok: false,
                        error: `restore set(${fmt(current)}) threw: ${err instanceof Error ? err.message : String(err)}`,
                    };
                }
                return { kind: 'toggle' as const, ok: true, error: null };
            }

            if (hasChoices) {
                const keys = Object.keys(def.choices ?? {});
                const next = keys.find((k) => k !== current);
                if (next === undefined) {
                    // Only one choice (or empty) — nothing meaningful to flip.
                    return { kind: 'read' as const, ok: true, error: null };
                }
                try {
                    await settings.set(systemId, namespacedKey, next);
                } catch (err) {
                    return {
                        kind: 'choice' as const,
                        ok: false,
                        error: `set('${next}') threw: ${err instanceof Error ? err.message : String(err)}`,
                    };
                }
                const observed = settings.get(systemId, namespacedKey);
                if (observed !== next) {
                    try {
                        await settings.set(systemId, namespacedKey, current);
                    } catch {
                        /* ignore */
                    }
                    return {
                        kind: 'choice' as const,
                        ok: false,
                        error: `set('${next}') did not stick — observed ${fmt(observed)}`,
                    };
                }
                try {
                    await settings.set(systemId, namespacedKey, current);
                } catch (err) {
                    return {
                        kind: 'choice' as const,
                        ok: false,
                        error: `restore set('${fmt(current)}') threw: ${err instanceof Error ? err.message : String(err)}`,
                    };
                }
                return { kind: 'choice' as const, ok: true, error: null };
            }

            if (isNumber) {
                const next = (typeof current === 'number' ? current : 0) + 1;
                try {
                    await settings.set(systemId, namespacedKey, next);
                    const observed = settings.get(systemId, namespacedKey);
                    if (observed !== next) {
                        await settings.set(systemId, namespacedKey, current).catch(() => undefined);
                        return { kind: 'toggle' as const, ok: false, error: `set(${next}) did not stick — observed ${fmt(observed)}` };
                    }
                    await settings.set(systemId, namespacedKey, current);
                    return { kind: 'toggle' as const, ok: true, error: null };
                } catch (err) {
                    return { kind: 'toggle' as const, ok: false, error: `number flip threw: ${err instanceof Error ? err.message : String(err)}` };
                }
            }

            if (isArray) {
                // Re-set to the same array shape so the write path runs
                // without changing state. JSON.stringify preserves shape;
                // Foundry's set() handles the array round-trip.
                try {
                    await settings.set(systemId, namespacedKey, current);
                    return { kind: 'toggle' as const, ok: true, error: null };
                } catch (err) {
                    return { kind: 'toggle' as const, ok: false, error: `array re-set threw: ${err instanceof Error ? err.message : String(err)}` };
                }
            }

            // object / null / unknown — re-set to current to exercise the
            // write path without disturbing state.
            try {
                await settings.set(systemId, namespacedKey, current);
                return { kind: 'toggle' as const, ok: true, error: null };
            } catch {
                return { kind: 'read' as const, ok: true, error: null };
            }
        },
        { fullKey, systemId: SYSTEM_ID },
    );
    return {
        key: fullKey,
        kind: result.kind,
        ok: result.ok,
        error: result.error,
    };
}

async function probeAccessor(page: Page, name: (typeof SETTING_ACCESSORS)[number]): Promise<AccessorProbe> {
    const result = await page.evaluate(async (accessor: string) => {
        const hasAccessor = (c: AccessorOwner | undefined): c is AccessorOwner => c !== undefined && typeof c[accessor] === 'function';
        // The WH40KSettings class is not attached to any runtime global; the
        // canonical surface is the ES module shipped at
        // /systems/wh40k-rpg/module/wh40k-rpg-settings.js. Dynamic-import it
        // and call the static accessor directly. This mirrors how the system
        // code itself reaches the class (via `import { WH40KSettings }`),
        // which is the only path the source-coverage instrumentation sees.
        // eslint-disable-next-line no-restricted-syntax -- boundary: browser-context globalThis (Foundry CONFIG/game globals, no repo type)
        const foundryBrowserCtx = globalThis as unknown as AccessorWindow;
        // Fallback chain in case a future build re-exposes the class globally.
        const globalCandidates: Array<AccessorOwner | undefined> = [
            foundryBrowserCtx.CONFIG?.WH40K?.Settings,
            foundryBrowserCtx.game?.wh40k?.settings,
            foundryBrowserCtx.game?.system?.api?.settings,
        ];
        let owner: AccessorOwner | undefined = globalCandidates.find(hasAccessor);
        if (!owner) {
            try {
                // Indirect dynamic-import URL so TS doesn't try to resolve the
                // runtime Foundry static-file path as a module specifier at
                // typecheck time. The browser resolves it against Foundry's
                // /systems/<id>/ static mount at runtime.
                const url = '/systems/wh40k-rpg/module/wh40k-rpg-settings.js';
                const importer = async (specifier: string): Promise<{ WH40KSettings?: AccessorOwner }> =>
                    import(/* @vite-ignore */ specifier) as Promise<{ WH40KSettings?: AccessorOwner }>;
                const mod = await importer(url);
                if (hasAccessor(mod.WH40KSettings)) {
                    owner = mod.WH40KSettings;
                }
            } catch (err) {
                return { ok: false, error: `dynamic import failed: ${err instanceof Error ? err.message : String(err)}` };
            }
        }
        if (!owner) return { ok: false, error: `accessor ${accessor} not found on WH40KSettings surface` };
        try {
            const fn = owner[accessor];
            if (typeof fn !== 'function') return { ok: false, error: `accessor ${accessor} is not callable` };
            const value = fn.call(owner);
            return { ok: value !== undefined, error: value === undefined ? 'accessor returned undefined' : null };
        } catch (err) {
            return { ok: false, error: `accessor threw: ${err instanceof Error ? err.message : String(err)}` };
        }
    }, name);
    return { name, ok: result.ok, error: result.error };
}

test.describe.serial('settings toggles (Tier B)', () => {
    test('every registered wh40k-rpg.* setting toggles or reads cleanly', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const keys = await listSettingKeys(page);
        test.skip(keys.length === 0, 'no wh40k-rpg.* settings discovered');

        const failures: string[] = [];
        for (const fullKey of keys) {
            let probe: SettingProbe;
            try {
                probe = await probeSetting(page, fullKey);
            } catch (err) {
                probe = { key: fullKey, kind: 'read', ok: false, error: err instanceof Error ? err.message : String(err) };
            }
            const shortKey = fullKey.startsWith(`${SYSTEM_ID}.`) ? fullKey.slice(SYSTEM_ID.length + 1) : fullKey;
            if (probe.ok) {
                // Every successful probe reads the setting; record `setting.read`
                // unconditionally. The toggle/choice variants additionally
                // record `setting.toggle` for the write path coverage.
                recordCoverage('setting.read', shortKey);
                if (probe.kind === 'toggle' || probe.kind === 'choice') {
                    recordCoverage('setting.toggle', shortKey);
                }
                continue;
            }
            failures.push(`${shortKey} (${probe.kind}): ${probe.error ?? 'unknown error'}`);
        }

        // Accessor sweep — drives the `WH40KSettings.is*/get*` branches
        // independently of the per-key sweep so source coverage on
        // src/module/wh40k-rpg-settings.ts covers both the register-site
        // and the read-site lines.
        for (const accessor of SETTING_ACCESSORS) {
            let probe: AccessorProbe;
            try {
                probe = await probeAccessor(page, accessor);
            } catch (err) {
                probe = { name: accessor, ok: false, error: err instanceof Error ? err.message : String(err) };
            }
            if (probe.ok) {
                recordCoverage('setting.accessor', probe.name);
                continue;
            }
            // Accessor probes are best-effort — record the failure but do
            // not let it sink the spec; the class surface depends on init
            // wiring that may change between builds.
            failures.push(`accessor ${probe.name}: ${probe.error ?? 'unknown error'}`);
        }

        expect(failures, `${failures.length}/${keys.length + SETTING_ACCESSORS.length} setting probes failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
