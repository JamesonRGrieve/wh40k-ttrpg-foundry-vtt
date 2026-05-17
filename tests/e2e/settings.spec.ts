import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Data-driven coverage of every WH40K system setting registered via
 * `WH40KSettings.registerSettings()`. For each registered setting key
 * under the `wh40k-rpg.*` namespace this spec:
 *
 *   1. Reads the current value via `game.settings.get(...)`.
 *   2. If the setting is `requiresReload: true` it is RECORDED AS READ
 *      ONLY — writing it mid-test crashes the active session (same
 *      reason `roll-methods.spec.ts` deliberately does not touch the
 *      simple-attack-rolls / simple-psychic-rolls toggles).
 *   3. If the setting is a boolean, flips it, asserts the new value
 *      landed, then flips it back to the original.
 *   4. If the setting is a string with a `choices` map, picks the FIRST
 *      non-current choice, sets it, asserts, restores.
 *   5. Otherwise (number / object / array / null) the setting is
 *      recorded as a read-only probe.
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

async function listSettingKeys(page: import('@playwright/test').Page): Promise<string[]> {
    return page.evaluate((systemId: string) => {
        const { game } = globalThis as unknown as {
            game?: { settings?: { settings?: Map<string, unknown> } };
        };
        const settings = game?.settings?.settings;
        if (!settings || typeof settings.keys !== 'function') return [];
        return Array.from(settings.keys()).filter((k): k is string => typeof k === 'string' && k.startsWith(`${systemId}.`));
    }, SYSTEM_ID);
}

async function probeSetting(page: import('@playwright/test').Page, fullKey: string): Promise<SettingProbe> {
    const result = await page.evaluate(
        async ({ fullKey, systemId }) => {
            const { game } = globalThis as unknown as {
                game?: {
                    settings?: {
                        settings?: Map<
                            string,
                            {
                                type?: unknown;
                                choices?: Record<string, string>;
                                requiresReload?: boolean;
                                default?: unknown;
                            }
                        >;
                        get: (ns: string, k: string) => unknown;
                        set: (ns: string, k: string, v: unknown) => Promise<unknown>;
                    };
                };
            };
            const settings = game?.settings;
            if (!settings) return { kind: 'read' as const, ok: false, error: 'game.settings unavailable' };

            const namespacedKey = fullKey.startsWith(`${systemId}.`) ? fullKey.slice(systemId.length + 1) : fullKey;
            const def = settings.settings?.get(fullKey);
            if (!def) return { kind: 'read' as const, ok: false, error: `definition missing for ${fullKey}` };

            let current: unknown;
            try {
                current = settings.get(systemId, namespacedKey);
            } catch (err) {
                return {
                    kind: 'read' as const,
                    ok: false,
                    error: `get threw: ${String((err as Error)?.message ?? err)}`,
                };
            }

            // requiresReload settings cannot be flipped mid-session without
            // crashing the active page — record as a successful read-only
            // probe instead of attempting a write.
            if (def.requiresReload === true) {
                return { kind: 'read' as const, ok: true, error: null };
            }

            const isBoolean = def.type === Boolean || typeof current === 'boolean';
            const hasChoices = def.choices && typeof def.choices === 'object';

            if (isBoolean) {
                const next = !current;
                try {
                    await settings.set(systemId, namespacedKey, next);
                } catch (err) {
                    return {
                        kind: 'toggle' as const,
                        ok: false,
                        error: `set(${String(next)}) threw: ${String((err as Error)?.message ?? err)}`,
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
                        error: `set(${String(next)}) did not stick — observed ${String(observed)}`,
                    };
                }
                try {
                    await settings.set(systemId, namespacedKey, current);
                } catch (err) {
                    return {
                        kind: 'toggle' as const,
                        ok: false,
                        error: `restore set(${String(current)}) threw: ${String((err as Error)?.message ?? err)}`,
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
                        error: `set('${next}') threw: ${String((err as Error)?.message ?? err)}`,
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
                        error: `set('${next}') did not stick — observed ${String(observed)}`,
                    };
                }
                try {
                    await settings.set(systemId, namespacedKey, current);
                } catch (err) {
                    return {
                        kind: 'choice' as const,
                        ok: false,
                        error: `restore set('${String(current)}') threw: ${String((err as Error)?.message ?? err)}`,
                    };
                }
                return { kind: 'choice' as const, ok: true, error: null };
            }

            // number / object / array / null / unknown — read-only probe.
            return { kind: 'read' as const, ok: true, error: null };
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

async function probeAccessor(page: import('@playwright/test').Page, name: (typeof SETTING_ACCESSORS)[number]): Promise<AccessorProbe> {
    const result = await page.evaluate((accessor: string) => {
        const { CONFIG, game } = globalThis as unknown as {
            CONFIG?: { WH40K?: { Settings?: Record<string, unknown> } };
            game?: { wh40k?: { settings?: Record<string, unknown> }; system?: { api?: { settings?: Record<string, unknown> } } };
        };
        // The class is exposed in several places depending on init order:
        // - CONFIG.WH40K.Settings (preferred — set during system init)
        // - game.wh40k.settings / game.system.api.settings (fallback)
        const candidates: Array<Record<string, unknown> | undefined> = [CONFIG?.WH40K?.Settings, game?.wh40k?.settings, game?.system?.api?.settings];
        const owner = candidates.find((c) => c && typeof (c as Record<string, unknown>)[accessor] === 'function');
        if (!owner) return { ok: false, error: `accessor ${accessor} not found on WH40KSettings surface` };
        try {
            const fn = (owner as Record<string, unknown>)[accessor] as () => unknown;
            const value = fn.call(owner);
            return { ok: value !== undefined, error: value === undefined ? 'accessor returned undefined' : null };
        } catch (err) {
            return { ok: false, error: `accessor threw: ${String((err as Error)?.message ?? err)}` };
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
            const probe = await probeSetting(page, fullKey).catch((err) => ({
                key: fullKey,
                kind: 'read' as const,
                ok: false,
                error: String((err as Error)?.message ?? err),
            }));
            const shortKey = fullKey.startsWith(`${SYSTEM_ID}.`) ? fullKey.slice(SYSTEM_ID.length + 1) : fullKey;
            if (probe.ok) {
                if (probe.kind === 'toggle' || probe.kind === 'choice') {
                    recordCoverage('setting.toggle', shortKey);
                } else {
                    recordCoverage('setting.read', shortKey);
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
            const probe = await probeAccessor(page, accessor).catch((err) => ({
                name: accessor,
                ok: false,
                error: String((err as Error)?.message ?? err),
            }));
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
