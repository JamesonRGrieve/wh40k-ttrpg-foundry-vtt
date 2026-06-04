import { ALL_SYSTEM_IDS, type GameSystemId } from './config/game-systems/types.ts';
import { SYSTEM_ID } from './constants.ts';

export type DH2Ruleset = 'raw' | 'homebrew';

/** JSON-serialisable setting default — a primitive or an array thereof. */
type SettingDefault = number | boolean | string | readonly SettingDefault[];

/**
 * Declarative descriptor for one registered world/client setting (#299). The
 * registration order of the descriptor array, plus each entry's key/scope/config/
 * requiresReload/default/type/choice-keys, is load-bearing for migrations and is
 * pinned by the structural-shape snapshot in `wh40k-rpg-settings.test.ts`.
 * `name` / `hint` (and choice values) are WH40K.SETTINGS.* langpack keys —
 * Foundry localizes them at render time.
 */
interface SettingDescriptor {
    key: string;
    name: string;
    hint: string;
    scope: 'world' | 'client';
    config: boolean;
    requiresReload?: boolean;
    default: SettingDefault;
    type: NumberConstructor | BooleanConstructor | StringConstructor | ArrayConstructor;
    choices?: Record<string, string>;
}

/** Degrees-of-success calculation mode. `raw` resolves per game system; the
 * other two force one method across all systems. */
export type DegreesMode = 'raw' | 'gen1' | 'gen2';

// biome-ignore lint/complexity/noStaticOnlyClass: stable API surface with static SETTINGS constants and many callers
export class WH40KSettings {
    static SETTINGS = {
        worldVersion: 'world-version',
        primaryGameSystem: 'primary-game-system',
        simpleAttackRolls: 'simple-attack-rolls',
        simplePsychicRolls: 'simple-psychic-rolls',
        processActiveEffectsDuringCombat: 'active-effects-during-combat',
        combatPresets: 'combat-presets',
        movementAutomation: 'movement-automation',
        dh2Ruleset: 'dh2-ruleset',
        degreesMode: 'degrees-mode',
        promptIncompleteOriginPath: 'prompt-incomplete-origin-path',
        freeformCharacters: 'freeform-characters',
        characteristicOffset: 'characteristic-offset',
        pointBuyPool: 'point-buy-pool',
        resyncOnReady: 'resync-on-ready',
        reconcileOriginGrantsOnReady: 'reconcile-origin-grants-on-ready',
        multipleFateBurnPerRoll: 'multiple-fate-burn-per-roll',
        autoPsychicPhenomena: 'auto-psychic-phenomena',
        autoRollDamage: 'auto-roll-damage',
        autoApplyDamage: 'auto-apply-damage',
        requireCombatToAttack: 'require-combat-to-attack',
    };

    /** When true, a successful weapon/psychic attack rolls its damage automatically
     *  and posts the damage card, rather than waiting for the chat "Roll Damage"
     *  button. Defaults to true. Safe to call before the setting is registered
     *  (returns true). */
    static isAutoRollDamageEnabled(): boolean {
        try {
            return game.settings.get(SYSTEM_ID, WH40KSettings.SETTINGS.autoRollDamage) !== false;
        } catch {
            return true;
        }
    }

    /** When true, a damage roll resolved on a GM client against a selected target
     *  automatically applies the reduced damage (armour by hit location + Toughness
     *  Bonus) to the target — rolling critical damage and applying its status on
     *  overflow — instead of waiting for the chat "Assign Damage" button. Opt-in;
     *  defaults to false. Safe before registration (returns false). */
    static isAutoApplyDamageEnabled(): boolean {
        try {
            return game.settings.get(SYSTEM_ID, WH40KSettings.SETTINGS.autoApplyDamage) === true;
        } catch {
            return false;
        }
    }

    /** When true, weapon attacks may only be initiated during an active combat
     *  encounter the attacker is part of (#251). Defaults to true; GMs can
     *  disable it for out-of-combat / narrative attacks. Safe before
     *  registration (returns true). */
    static isCombatRequiredToAttack(): boolean {
        try {
            return game.settings.get(SYSTEM_ID, WH40KSettings.SETTINGS.requireCombatToAttack) !== false;
        } catch {
            return true;
        }
    }

    /**
     * Movement-automation level (#235): `full` enforces character movement speeds
     * during combat, `display` shows the ruler only, `none` is off. Defaults to
     * `full`. Safe before registration (returns `full`).
     */
    static getMovementAutomation(): 'full' | 'display' | 'none' {
        try {
            const value = String(game.settings.get(SYSTEM_ID, WH40KSettings.SETTINGS.movementAutomation));
            return value === 'display' || value === 'none' ? value : 'full';
        } catch {
            return 'full';
        }
    }

    /** Homebrew: allow more than one Fate Point spend on the same roll. RAW permits only one. */
    static isMultipleFateBurnAllowed(): boolean {
        try {
            return game.settings.get(SYSTEM_ID, WH40KSettings.SETTINGS.multipleFateBurnPerRoll) === true;
        } catch {
            return false;
        }
    }

    /** Integer offset added to the 20-point characteristic baseline during character generation. Defaults to 0. */
    static getCharacteristicOffset(): number {
        try {
            const n = Number(game.settings.get(SYSTEM_ID, WH40KSettings.SETTINGS.characteristicOffset));
            return Number.isFinite(n) ? Math.trunc(n) : 0;
        } catch {
            return 0;
        }
    }

    /** Effective base characteristic value used by character generation: 20 + offset. */
    static getCharacteristicBase(): number {
        // RAW characteristic base for the FFG d100 family (2d10+25 → base 25). The
        // offset setting tunes it per world; experienced starts add +5 on top (#223).
        return 25 + WH40KSettings.getCharacteristicOffset();
    }

    /**
     * Size of the point pool a player spends in point-buy character generation.
     * Content-agnostic primitive (a budget integer, not a per-characteristic
     * mechanic table) — the spend cost is a flat 1 point per +1, so no content
     * lookup is involved. Defaults to 60 (DH2e). Clamped to a non-negative integer.
     */
    static getCharacteristicPointBuyPool(): number {
        try {
            const n = Number(game.settings.get(SYSTEM_ID, WH40KSettings.SETTINGS.pointBuyPool));
            return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 60;
        } catch {
            return 60;
        }
    }

    /** Current DH2e ruleset (raw vs homebrew). Safe to call before setting is registered (returns homebrew). */
    /** The configured degrees-of-success mode (defaults to `raw`, which
     *  resolves per game system at the call site). Safe before registration. */
    static getDegreesMode(): DegreesMode {
        try {
            const value = String(game.settings.get(SYSTEM_ID, WH40KSettings.SETTINGS.degreesMode));
            return value === 'gen1' || value === 'gen2' ? value : 'raw';
        } catch {
            return 'raw';
        }
    }

    /** When true (default), opening an unbuilt character/NPC sheet prompts to
     *  run the origin-path builder. Safe before registration (returns true). */
    static isOriginPathPromptEnabled(): boolean {
        try {
            return game.settings.get(SYSTEM_ID, WH40KSettings.SETTINGS.promptIncompleteOriginPath) !== false;
        } catch {
            return true;
        }
    }

    /** When true, building a character by dragging items (e.g. an origin path)
     *  directly onto an actor is permitted; otherwise the supported path is the
     *  Origin Path Builder. Defaults to false. Safe before registration. See
     *  issue #219. */
    static isFreeformCharactersEnabled(): boolean {
        try {
            return game.settings.get(SYSTEM_ID, WH40KSettings.SETTINGS.freeformCharacters) === true;
        } catch {
            return false;
        }
    }

    static getRuleset(): DH2Ruleset {
        try {
            return game.settings.get(SYSTEM_ID, WH40KSettings.SETTINGS.dh2Ruleset) === 'raw' ? 'raw' : 'homebrew';
        } catch {
            return 'homebrew';
        }
    }

    static isHomebrew(): boolean {
        return WH40KSettings.getRuleset() === 'homebrew';
    }

    /** The world's primary 40K RPG line; default dh2. Safe to call before settings init. */
    static getPrimaryGameSystem(): GameSystemId {
        try {
            const value = String(game.settings.get(SYSTEM_ID, WH40KSettings.SETTINGS.primaryGameSystem));
            return ALL_SYSTEM_IDS.find((id) => id === value) ?? 'dh2';
        } catch {
            return 'dh2';
        }
    }

    static registerSettings(): void {
        const S = WH40KSettings.SETTINGS;
        const descriptors: readonly SettingDescriptor[] = [
            {
                key: S.worldVersion,
                name: 'WH40K.SETTINGS.WorldVersion.Name',
                hint: 'WH40K.SETTINGS.WorldVersion.Hint',
                scope: 'world',
                config: true,
                requiresReload: true,
                default: 1,
                type: Number,
            },
            {
                key: S.processActiveEffectsDuringCombat,
                name: 'WH40K.SETTINGS.ProcessActiveEffectsDuringCombat.Name',
                hint: 'WH40K.SETTINGS.ProcessActiveEffectsDuringCombat.Hint',
                scope: 'world',
                config: true,
                requiresReload: true,
                default: true,
                type: Boolean,
            },
            {
                key: S.simpleAttackRolls,
                name: 'WH40K.SETTINGS.SimpleAttackRolls.Name',
                hint: 'WH40K.SETTINGS.SimpleAttackRolls.Hint',
                scope: 'client',
                config: true,
                requiresReload: true,
                default: false,
                type: Boolean,
            },
            {
                key: S.simplePsychicRolls,
                name: 'WH40K.SETTINGS.SimplePsychicRolls.Name',
                hint: 'WH40K.SETTINGS.SimplePsychicRolls.Hint',
                scope: 'client',
                config: true,
                requiresReload: true,
                default: false,
                type: Boolean,
            },
            {
                key: S.autoPsychicPhenomena,
                name: 'WH40K.SETTINGS.AutoPsychicPhenomena.Name',
                hint: 'WH40K.SETTINGS.AutoPsychicPhenomena.Hint',
                scope: 'world',
                config: true,
                default: true,
                type: Boolean,
            },
            {
                key: S.autoRollDamage,
                name: 'WH40K.SETTINGS.AutoRollDamage.Name',
                hint: 'WH40K.SETTINGS.AutoRollDamage.Hint',
                scope: 'world',
                config: true,
                default: true,
                type: Boolean,
            },
            {
                key: S.autoApplyDamage,
                name: 'WH40K.SETTINGS.AutoApplyDamage.Name',
                hint: 'WH40K.SETTINGS.AutoApplyDamage.Hint',
                scope: 'world',
                config: true,
                default: false,
                type: Boolean,
            },
            {
                key: S.requireCombatToAttack,
                name: 'WH40K.SETTINGS.RequireCombatToAttack.Name',
                hint: 'WH40K.SETTINGS.RequireCombatToAttack.Hint',
                scope: 'world',
                config: true,
                default: true,
                type: Boolean,
            },
            {
                key: S.combatPresets,
                name: 'WH40K.SETTINGS.CombatPresets.Name',
                hint: 'WH40K.SETTINGS.CombatPresets.Hint',
                scope: 'world',
                config: false,
                default: [],
                type: Array,
            },
            {
                key: S.primaryGameSystem,
                name: 'WH40K.SETTINGS.PrimaryGameSystem.Name',
                hint: 'WH40K.SETTINGS.PrimaryGameSystem.Hint',
                scope: 'world',
                config: true,
                requiresReload: true,
                default: 'dh2',
                type: String,
                choices: Object.fromEntries(ALL_SYSTEM_IDS.map((id) => [id, `WH40K.SETTINGS.PrimaryGameSystem.Choices.${id}`])),
            },
            {
                key: S.dh2Ruleset,
                name: 'WH40K.SETTINGS.DH2Ruleset.Name',
                hint: 'WH40K.SETTINGS.DH2Ruleset.Hint',
                scope: 'world',
                config: true,
                requiresReload: true,
                default: 'homebrew',
                type: String,
                choices: {
                    homebrew: 'WH40K.SETTINGS.DH2Ruleset.Choices.Homebrew',
                    raw: 'WH40K.SETTINGS.DH2Ruleset.Choices.Raw',
                },
            },
            {
                key: S.degreesMode,
                name: 'WH40K.SETTINGS.DegreesMode.Name',
                hint: 'WH40K.SETTINGS.DegreesMode.Hint',
                scope: 'world',
                config: true,
                requiresReload: false,
                default: 'raw',
                type: String,
                choices: {
                    raw: 'WH40K.SETTINGS.DegreesMode.Choices.Raw',
                    gen1: 'WH40K.SETTINGS.DegreesMode.Choices.Gen1',
                    gen2: 'WH40K.SETTINGS.DegreesMode.Choices.Gen2',
                },
            },
            {
                key: S.promptIncompleteOriginPath,
                name: 'WH40K.SETTINGS.PromptIncompleteOriginPath.Name',
                hint: 'WH40K.SETTINGS.PromptIncompleteOriginPath.Hint',
                scope: 'world',
                config: true,
                requiresReload: false,
                default: true,
                type: Boolean,
            },
            {
                key: S.freeformCharacters,
                name: 'WH40K.SETTINGS.FreeformCharacters.Name',
                hint: 'WH40K.SETTINGS.FreeformCharacters.Hint',
                scope: 'world',
                config: true,
                requiresReload: false,
                default: false,
                type: Boolean,
            },
            {
                key: S.characteristicOffset,
                name: 'WH40K.SETTINGS.CharacteristicOffset.Name',
                hint: 'WH40K.SETTINGS.CharacteristicOffset.Hint',
                scope: 'world',
                config: true,
                default: 0,
                type: Number,
            },
            {
                key: S.pointBuyPool,
                name: 'WH40K.SETTINGS.PointBuyPool.Name',
                hint: 'WH40K.SETTINGS.PointBuyPool.Hint',
                scope: 'world',
                config: true,
                // DH2e point-buy allocates 60 points over the base values (#223).
                default: 60,
                type: Number,
            },
            {
                key: S.movementAutomation,
                name: 'WH40K.SETTINGS.MovementAutomation.Name',
                hint: 'WH40K.SETTINGS.MovementAutomation.Hint',
                scope: 'world',
                config: true,
                default: 'full',
                type: String,
                choices: {
                    full: 'WH40K.SETTINGS.MovementAutomation.Full',
                    display: 'WH40K.SETTINGS.MovementAutomation.Display',
                    none: 'WH40K.SETTINGS.MovementAutomation.None',
                },
            },
            {
                key: S.multipleFateBurnPerRoll,
                name: 'WH40K.SETTINGS.MultipleFateBurnPerRoll.Name',
                hint: 'WH40K.SETTINGS.MultipleFateBurnPerRoll.Hint',
                scope: 'world',
                config: true,
                default: false,
                type: Boolean,
            },
            {
                key: S.resyncOnReady,
                name: 'WH40K.SETTINGS.ResyncOnReady.Name',
                hint: 'WH40K.SETTINGS.ResyncOnReady.Hint',
                scope: 'world',
                config: true,
                default: true,
                type: Boolean,
            },
            {
                key: S.reconcileOriginGrantsOnReady,
                name: 'WH40K.SETTINGS.ReconcileOriginGrantsOnReady.Name',
                hint: 'WH40K.SETTINGS.ReconcileOriginGrantsOnReady.Hint',
                scope: 'world',
                config: true,
                default: true,
                type: Boolean,
            },
        ];
        for (const d of descriptors) {
            game.settings.register(SYSTEM_ID, d.key, {
                name: d.name,
                hint: d.hint,
                scope: d.scope,
                config: d.config,
                default: d.default,
                type: d.type,
                ...(d.requiresReload !== undefined ? { requiresReload: d.requiresReload } : {}),
                ...(d.choices !== undefined ? { choices: d.choices } : {}),
            });
        }
    }
}
