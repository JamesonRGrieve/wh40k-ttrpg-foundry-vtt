/**
 * Regression tests for the DH2e character-generation defaults (#223).
 *
 * Point-buy generation must reflect DH2e RAW: a 60-point pool over a base of 25
 * (the FFG d100 family is 2d10+25). Both getters fall back to their defaults
 * when `game.settings` is unavailable (as in this unit env), so these assert the
 * RAW values directly.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_ID } from './constants.ts';
import { WH40KSettings } from './wh40k-rpg-settings.ts';

describe('WH40KSettings generation defaults (#223)', () => {
    it('characteristic base defaults to 25 (FFG d100 2d10+25)', () => {
        expect(WH40KSettings.getCharacteristicBase()).toBe(25);
    });

    it('point-buy pool defaults to 60', () => {
        expect(WH40KSettings.getCharacteristicPointBuyPool()).toBe(60);
    });
});

/**
 * Guard for the #299 table-drive refactor of registerSettings(). The setting
 * keys, scope, config, requiresReload, default, type, choice-keys, and the
 * registration ORDER are load-bearing for migrations (Foundry persists by key;
 * order matters for first-boot defaulting). This snapshots the *structural*
 * shape of every register() call so the descriptor-loop refactor is proven
 * byte-identical. name/hint are intentionally excluded — they migrate from raw
 * English to WH40K.SETTINGS.* langpack keys in the same issue (Direction #6).
 */
type SettingValue = number | boolean | string | readonly SettingValue[];

/** The exact shape registerSettings() hands to game.settings.register(). */
interface RegisteredSettingConfig {
    name: string;
    hint: string;
    scope: 'world' | 'client';
    config: boolean;
    requiresReload?: boolean;
    default: SettingValue;
    type: NumberConstructor | BooleanConstructor | StringConstructor | ArrayConstructor;
    choices?: Record<string, string>;
}

interface CapturedSetting {
    key: string;
    scope: 'world' | 'client';
    config: boolean;
    requiresReload: boolean | undefined;
    default: string;
    type: string;
    choices: string[] | undefined;
}

function captureRegistrations(): CapturedSetting[] {
    const calls: CapturedSetting[] = [];
    const register = (namespace: string, key: string, cfg: RegisteredSettingConfig): void => {
        expect(namespace).toBe(SYSTEM_ID);
        calls.push({
            key,
            scope: cfg.scope,
            config: cfg.config,
            requiresReload: cfg.requiresReload,
            default: JSON.stringify(cfg.default),
            type: cfg.type.name,
            choices: cfg.choices !== undefined ? Object.keys(cfg.choices) : undefined,
        });
    };
    vi.stubGlobal('game', { settings: { register } });
    WH40KSettings.registerSettings();
    return calls;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('WH40KSettings.registerSettings — structural-shape guard (#299)', () => {
    it('registers every setting with stable key/scope/config/requiresReload/default/type/choices, in order', () => {
        expect(captureRegistrations()).toMatchInlineSnapshot(`
          [
            {
              "choices": undefined,
              "config": true,
              "default": "1",
              "key": "world-version",
              "requiresReload": true,
              "scope": "world",
              "type": "Number",
            },
            {
              "choices": undefined,
              "config": true,
              "default": "true",
              "key": "active-effects-during-combat",
              "requiresReload": true,
              "scope": "world",
              "type": "Boolean",
            },
            {
              "choices": undefined,
              "config": true,
              "default": "false",
              "key": "simple-attack-rolls",
              "requiresReload": true,
              "scope": "client",
              "type": "Boolean",
            },
            {
              "choices": undefined,
              "config": true,
              "default": "false",
              "key": "simple-psychic-rolls",
              "requiresReload": true,
              "scope": "client",
              "type": "Boolean",
            },
            {
              "choices": undefined,
              "config": true,
              "default": "true",
              "key": "auto-psychic-phenomena",
              "requiresReload": undefined,
              "scope": "world",
              "type": "Boolean",
            },
            {
              "choices": undefined,
              "config": true,
              "default": "true",
              "key": "auto-roll-damage",
              "requiresReload": undefined,
              "scope": "world",
              "type": "Boolean",
            },
            {
              "choices": undefined,
              "config": true,
              "default": "false",
              "key": "auto-apply-damage",
              "requiresReload": undefined,
              "scope": "world",
              "type": "Boolean",
            },
            {
              "choices": undefined,
              "config": true,
              "default": "true",
              "key": "require-combat-to-attack",
              "requiresReload": undefined,
              "scope": "world",
              "type": "Boolean",
            },
            {
              "choices": undefined,
              "config": false,
              "default": "[]",
              "key": "combat-presets",
              "requiresReload": undefined,
              "scope": "world",
              "type": "Array",
            },
            {
              "choices": [
                "rt",
                "dh1",
                "dh2",
                "bc",
                "ow",
                "dw",
                "im",
              ],
              "config": true,
              "default": ""dh2"",
              "key": "primary-game-system",
              "requiresReload": true,
              "scope": "world",
              "type": "String",
            },
            {
              "choices": [
                "homebrew",
                "raw",
              ],
              "config": true,
              "default": ""homebrew"",
              "key": "dh2-ruleset",
              "requiresReload": true,
              "scope": "world",
              "type": "String",
            },
            {
              "choices": [
                "raw",
                "gen1",
                "gen2",
              ],
              "config": true,
              "default": ""raw"",
              "key": "degrees-mode",
              "requiresReload": false,
              "scope": "world",
              "type": "String",
            },
            {
              "choices": [
                "auto",
                "halving",
                "flat",
                "condition",
              ],
              "config": true,
              "default": ""auto"",
              "key": "fatigue-mode",
              "requiresReload": false,
              "scope": "world",
              "type": "String",
            },
            {
              "choices": undefined,
              "config": true,
              "default": "true",
              "key": "prompt-incomplete-origin-path",
              "requiresReload": false,
              "scope": "world",
              "type": "Boolean",
            },
            {
              "choices": undefined,
              "config": true,
              "default": "false",
              "key": "freeform-characters",
              "requiresReload": false,
              "scope": "world",
              "type": "Boolean",
            },
            {
              "choices": undefined,
              "config": true,
              "default": "false",
              "key": "freeform-creation",
              "requiresReload": false,
              "scope": "world",
              "type": "Boolean",
            },
            {
              "choices": undefined,
              "config": true,
              "default": "false",
              "key": "homebrew-self-targeting",
              "requiresReload": false,
              "scope": "world",
              "type": "Boolean",
            },
            {
              "choices": undefined,
              "config": true,
              "default": "false",
              "key": "auto-cover-los",
              "requiresReload": false,
              "scope": "world",
              "type": "Boolean",
            },
            {
              "choices": undefined,
              "config": true,
              "default": "false",
              "key": "awareness-sense-split",
              "requiresReload": false,
              "scope": "world",
              "type": "Boolean",
            },
            {
              "choices": undefined,
              "config": true,
              "default": "0",
              "key": "characteristic-offset",
              "requiresReload": undefined,
              "scope": "world",
              "type": "Number",
            },
            {
              "choices": undefined,
              "config": true,
              "default": "60",
              "key": "point-buy-pool",
              "requiresReload": undefined,
              "scope": "world",
              "type": "Number",
            },
            {
              "choices": [
                "full",
                "display",
                "none",
              ],
              "config": true,
              "default": ""full"",
              "key": "movement-automation",
              "requiresReload": undefined,
              "scope": "world",
              "type": "String",
            },
            {
              "choices": undefined,
              "config": true,
              "default": "false",
              "key": "multiple-fate-burn-per-roll",
              "requiresReload": undefined,
              "scope": "world",
              "type": "Boolean",
            },
            {
              "choices": undefined,
              "config": true,
              "default": "true",
              "key": "resync-on-ready",
              "requiresReload": undefined,
              "scope": "world",
              "type": "Boolean",
            },
            {
              "choices": undefined,
              "config": true,
              "default": "true",
              "key": "reconcile-origin-grants-on-ready",
              "requiresReload": undefined,
              "scope": "world",
              "type": "Boolean",
            },
            {
              "choices": undefined,
              "config": false,
              "default": "60",
              "key": "warband-subtlety",
              "requiresReload": undefined,
              "scope": "world",
              "type": "Number",
            },
          ]
        `);
    });
});

describe('WH40KSettings — warband Subtlety pool (#64)', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('getWarbandSubtlety returns the default when game.settings is unavailable', () => {
        // No game stub: game.settings.get throws → helper returns the default.
        expect(WH40KSettings.getWarbandSubtlety()).toBe(WH40KSettings.WARBAND_SUBTLETY_DEFAULT);
    });

    it('getWarbandSubtlety reads + clamps the stored world value to 0..max', () => {
        const cases: Array<[number | string, number]> = [
            [42, 42],
            [-5, 0],
            [250, WH40KSettings.WARBAND_SUBTLETY_MAX],
            [37.9, 37],
            ['nonsense', WH40KSettings.WARBAND_SUBTLETY_DEFAULT],
        ];
        for (const [stored, expected] of cases) {
            vi.stubGlobal('game', { settings: { get: () => stored } });
            expect(WH40KSettings.getWarbandSubtlety()).toBe(expected);
            vi.unstubAllGlobals();
        }
    });

    it('setWarbandSubtlety writes the clamped, truncated value to the world setting', async () => {
        const writes: Array<{ ns: string; key: string; value: number }> = [];
        vi.stubGlobal('game', {
            settings: {
                set: (ns: string, key: string, value: number) => {
                    // Void return — `setWarbandSubtlety` awaits this; `await undefined` is fine.
                    writes.push({ ns, key, value });
                },
            },
        });
        await WH40KSettings.setWarbandSubtlety(53.7);
        await WH40KSettings.setWarbandSubtlety(-10);
        await WH40KSettings.setWarbandSubtlety(999);
        expect(writes.map((w) => w.value)).toEqual([53, 0, WH40KSettings.WARBAND_SUBTLETY_MAX]);
        expect(writes[0]).toMatchObject({ ns: SYSTEM_ID, key: WH40KSettings.SETTINGS.warbandSubtlety });
    });

    it('rerenderSubtletyDependentSheets re-renders only rendered sheets of actors carrying the subtlety field', () => {
        const rendered: string[] = [];
        interface FakeSubtletyActor {
            system: { subtlety?: { value: number; max: number } };
            sheet: { rendered: boolean; render: () => void };
        }
        const mkActor = (name: string, hasSubtlety: boolean, isRendered: boolean): FakeSubtletyActor => ({
            system: hasSubtlety ? { subtlety: { value: 60, max: 100 } } : {},
            sheet: {
                rendered: isRendered,
                render: () => {
                    rendered.push(name);
                },
            },
        });
        const actors = [
            mkActor('dh2-open', true, true), // DH2 acolyte, sheet open → re-render
            mkActor('dh2-closed', true, false), // DH2 acolyte, sheet closed → skip
            mkActor('npc-open', false, true), // no subtlety field → skip
        ];
        vi.stubGlobal('game', { actors: { contents: actors } });
        WH40KSettings.rerenderSubtletyDependentSheets();
        expect(rendered).toEqual(['dh2-open']);
    });

    it('rerenderSubtletyDependentSheets is a no-op when game/actors are unavailable', () => {
        // No game stub at all.
        expect(() => {
            WH40KSettings.rerenderSubtletyDependentSheets();
        }).not.toThrow();
    });
});

/**
 * Parameterized coverage for every WH40KSettings value-space accessor — the
 * "system parameters" (homebrew toggle, combat/automation flags, generation
 * tunables, primary game line). Each accessor is confirmed across its FULL
 * value space: every valid stored value, invalid input, and the
 * pre-registration safe default (no `game` global) that every accessor
 * guarantees so DataModel prep can read it during early boot.
 */
describe('WH40KSettings — system-parameter value spaces (parameterized)', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    /** The value space a stored setting can take across these accessors. */
    type StoredSettingValue = boolean | number | string | undefined;

    /** Stub game.settings.get to return `value` for any setting key. */
    function stubSetting(value: StoredSettingValue): void {
        vi.stubGlobal('game', { settings: { get: (): StoredSettingValue => value } });
    }

    // --- Booleans ON by default (read as `!== false`) ---
    const defaultOnBooleans: ReadonlyArray<readonly [string, () => boolean]> = [
        ['isAutoRollDamageEnabled', () => WH40KSettings.isAutoRollDamageEnabled()],
        ['isCombatRequiredToAttack', () => WH40KSettings.isCombatRequiredToAttack()],
        ['isOriginPathPromptEnabled', () => WH40KSettings.isOriginPathPromptEnabled()],
    ];
    describe.each(defaultOnBooleans)('%s — default-on (!== false)', (_name, read) => {
        const cases: ReadonlyArray<readonly [boolean | undefined, boolean]> = [
            [true, true],
            [false, false],
            [undefined, true],
        ];
        it.each(cases)('stored %p → %p', (stored, expected) => {
            stubSetting(stored);
            expect(read()).toBe(expected);
        });
        it('pre-registration (no game) → true', () => {
            expect(read()).toBe(true);
        });
    });

    // --- Booleans OFF by default (read as `=== true`) ---
    const defaultOffBooleans: ReadonlyArray<readonly [string, () => boolean]> = [
        ['isAutoApplyDamageEnabled', () => WH40KSettings.isAutoApplyDamageEnabled()],
        ['isMultipleFateBurnAllowed', () => WH40KSettings.isMultipleFateBurnAllowed()],
        ['isFreeformCharactersEnabled', () => WH40KSettings.isFreeformCharactersEnabled()],
        ['isFreeformCreation', () => WH40KSettings.isFreeformCreation()],
    ];
    describe.each(defaultOffBooleans)('%s — default-off (=== true)', (_name, read) => {
        const cases: ReadonlyArray<readonly [boolean | undefined, boolean]> = [
            [true, true],
            [false, false],
            [undefined, false],
        ];
        it.each(cases)('stored %p → %p', (stored, expected) => {
            stubSetting(stored);
            expect(read()).toBe(expected);
        });
        it('pre-registration (no game) → false', () => {
            expect(read()).toBe(false);
        });
    });

    // --- Enum: movement automation (full | display | none) ---
    describe('getMovementAutomation', () => {
        const cases: ReadonlyArray<readonly [string, 'full' | 'display' | 'none']> = [
            ['full', 'full'],
            ['display', 'display'],
            ['none', 'none'],
            ['nonsense', 'full'],
            ['', 'full'],
        ];
        it.each(cases)('stored %p → %p', (stored, expected) => {
            stubSetting(stored);
            expect(WH40KSettings.getMovementAutomation()).toBe(expected);
        });
        it('pre-registration → full', () => {
            expect(WH40KSettings.getMovementAutomation()).toBe('full');
        });
    });

    // --- Enum: degrees-of-success mode (gen1 | gen2 | raw) ---
    describe('getDegreesMode', () => {
        const cases: ReadonlyArray<readonly [string, 'gen1' | 'gen2' | 'raw']> = [
            ['gen1', 'gen1'],
            ['gen2', 'gen2'],
            ['raw', 'raw'],
            ['nonsense', 'raw'],
        ];
        it.each(cases)('stored %p → %p', (stored, expected) => {
            stubSetting(stored);
            expect(WH40KSettings.getDegreesMode()).toBe(expected);
        });
        it('pre-registration → raw', () => {
            expect(WH40KSettings.getDegreesMode()).toBe('raw');
        });
    });

    // --- The homebrew toggle: ruleset (raw | homebrew) + isHomebrew ---
    describe('getRuleset / isHomebrew (homebrew toggle)', () => {
        const cases: ReadonlyArray<readonly [string, 'raw' | 'homebrew', boolean]> = [
            ['raw', 'raw', false],
            ['homebrew', 'homebrew', true],
            ['nonsense', 'homebrew', true],
        ];
        it.each(cases)('stored %p → ruleset %p, isHomebrew %p', (stored, ruleset, homebrew) => {
            stubSetting(stored);
            expect(WH40KSettings.getRuleset()).toBe(ruleset);
            expect(WH40KSettings.isHomebrew()).toBe(homebrew);
        });
        it('pre-registration → homebrew (the safe default)', () => {
            expect(WH40KSettings.getRuleset()).toBe('homebrew');
            expect(WH40KSettings.isHomebrew()).toBe(true);
        });
    });

    // --- Number: characteristic offset → base (25 + offset), truncated ---
    describe('getCharacteristicOffset / getCharacteristicBase', () => {
        const cases: ReadonlyArray<readonly [number | string, number, number]> = [
            [0, 0, 25],
            [5, 5, 30],
            [-5, -5, 20],
            [2.9, 2, 27],
            ['nonsense', 0, 25],
        ];
        it.each(cases)('stored %p → offset %p, base %p', (stored, offset, base) => {
            stubSetting(stored);
            expect(WH40KSettings.getCharacteristicOffset()).toBe(offset);
            expect(WH40KSettings.getCharacteristicBase()).toBe(base);
        });
        it('pre-registration → offset 0, base 25', () => {
            expect(WH40KSettings.getCharacteristicOffset()).toBe(0);
            expect(WH40KSettings.getCharacteristicBase()).toBe(25);
        });
    });

    // --- Number: point-buy pool (non-negative integer, default 60) ---
    describe('getCharacteristicPointBuyPool', () => {
        const cases: ReadonlyArray<readonly [number | string, number]> = [
            [60, 60],
            [0, 0],
            [-10, 0],
            [80.9, 80],
            ['nonsense', 60],
        ];
        it.each(cases)('stored %p → %p', (stored, expected) => {
            stubSetting(stored);
            expect(WH40KSettings.getCharacteristicPointBuyPool()).toBe(expected);
        });
        it('pre-registration → 60', () => {
            expect(WH40KSettings.getCharacteristicPointBuyPool()).toBe(60);
        });
    });

    // --- Primary game line: every one of the 7 systems + invalid → dh2 ---
    describe('getPrimaryGameSystem (per game line)', () => {
        const lines: ReadonlyArray<readonly [string]> = [['dh2'], ['dh1'], ['rt'], ['bc'], ['ow'], ['dw'], ['im']];
        it.each(lines)('stored %p resolves to itself', (id) => {
            stubSetting(id);
            expect(WH40KSettings.getPrimaryGameSystem()).toBe(id);
        });
        const invalid: ReadonlyArray<readonly [string]> = [['nonsense'], ['']];
        it.each(invalid)('invalid %p → dh2', (id) => {
            stubSetting(id);
            expect(WH40KSettings.getPrimaryGameSystem()).toBe('dh2');
        });
        it('pre-registration → dh2', () => {
            expect(WH40KSettings.getPrimaryGameSystem()).toBe('dh2');
        });
    });
});
