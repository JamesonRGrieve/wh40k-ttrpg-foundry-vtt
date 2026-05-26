import { SYSTEM_ID } from './constants.ts';

export type DH2Ruleset = 'raw' | 'homebrew';

// biome-ignore lint/complexity/noStaticOnlyClass: stable API surface with static SETTINGS constants and many callers
export class WH40KSettings {
    static SETTINGS = {
        worldVersion: 'world-version',
        simpleAttackRolls: 'simple-attack-rolls',
        simplePsychicRolls: 'simple-psychic-rolls',
        processActiveEffectsDuringCombat: 'active-effects-during-combat',
        combatPresets: 'combat-presets',
        movementAutomation: 'movement-automation',
        dh2Ruleset: 'dh2-ruleset',
        characteristicOffset: 'characteristic-offset',
        pointBuyPool: 'point-buy-pool',
        resyncOnReady: 'resync-on-ready',
        reconcileOriginGrantsOnReady: 'reconcile-origin-grants-on-ready',
        multipleFateBurnPerRoll: 'multiple-fate-burn-per-roll',
        autoPsychicPhenomena: 'auto-psychic-phenomena',
    };

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
        return 20 + WH40KSettings.getCharacteristicOffset();
    }

    /**
     * Size of the point pool a player spends in point-buy character generation.
     * Content-agnostic primitive (a budget integer, not a per-characteristic
     * mechanic table) — the spend cost is a flat 1 point per +1, so no content
     * lookup is involved. Defaults to 100. Clamped to a non-negative integer.
     */
    static getCharacteristicPointBuyPool(): number {
        try {
            const n = Number(game.settings.get(SYSTEM_ID, WH40KSettings.SETTINGS.pointBuyPool));
            return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 100;
        } catch {
            return 100;
        }
    }

    /** Current DH2e ruleset (raw vs homebrew). Safe to call before setting is registered (returns homebrew). */
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

    static registerSettings(): void {
        game.settings.register(SYSTEM_ID, WH40KSettings.SETTINGS.worldVersion, {
            name: 'World Version',
            hint: 'Used to handle data migration during system upgrades.',
            scope: 'world',
            config: true,
            requiresReload: true,
            default: 1,
            type: Number,
        });
        game.settings.register(SYSTEM_ID, WH40KSettings.SETTINGS.processActiveEffectsDuringCombat, {
            name: 'Active Effect Processing',
            hint: 'Process effects like Fire or Blood Loss on combat turn change.',
            scope: 'world',
            config: true,
            requiresReload: true,
            default: true,
            type: Boolean,
        });
        game.settings.register(SYSTEM_ID, WH40KSettings.SETTINGS.simpleAttackRolls, {
            name: 'Simple Attack Rolls',
            hint: 'Changes the default weapon automation behavior to disabled. Attack rolls will trigger a WeaponSkill or BallisticSkill roll as needed.',
            scope: 'client',
            config: true,
            requiresReload: true,
            default: false,
            type: Boolean,
        });
        game.settings.register(SYSTEM_ID, WH40KSettings.SETTINGS.simplePsychicRolls, {
            name: 'Simple Psychic Rolls',
            hint: 'Changes the default psychic power automation behavior to disabled. Psychic rolls will trigger a simple WillPower roll.',
            scope: 'client',
            config: true,
            requiresReload: true,
            default: false,
            type: Boolean,
        });
        game.settings.register(SYSTEM_ID, WH40KSettings.SETTINGS.autoPsychicPhenomena, {
            name: 'Auto-roll Psychic Phenomena',
            hint: 'When a psychic power triggers phenomena (per PR sufficiency and doubles rules), automatically draw from the Psychic Phenomena roll table. A draw of 75+ auto-cascades to the Perils of the Warp table. Disable to let the GM draw manually via the sheet buttons.',
            scope: 'world',
            config: true,
            default: true,
            type: Boolean,
        });
        game.settings.register(SYSTEM_ID, WH40KSettings.SETTINGS.combatPresets, {
            name: 'Combat Presets',
            hint: 'Saved NPC combat presets (templates).',
            scope: 'world',
            config: false,
            default: [],
            type: Array,
        });
        game.settings.register(SYSTEM_ID, WH40KSettings.SETTINGS.dh2Ruleset, {
            name: 'DH2e Economy Ruleset',
            hint: 'RAW uses only Influence + Requisition (Throne Gelt hidden). Homebrew adds Throne Gelt as street-level currency and keeps Influence at 0 until earned (no starting roll).',
            scope: 'world',
            config: true,
            requiresReload: true,
            default: 'homebrew',
            type: String,
            choices: {
                homebrew: 'Homebrew (Influence + Requisition + Throne Gelt)',
                raw: 'RAW (Influence + Requisition)',
            },
        });
        game.settings.register(SYSTEM_ID, WH40KSettings.SETTINGS.characteristicOffset, {
            name: 'WH40K.SETTINGS.CharacteristicOffset.Name',
            hint: 'WH40K.SETTINGS.CharacteristicOffset.Hint',
            scope: 'world',
            config: true,
            default: 0,
            type: Number,
        });
        game.settings.register(SYSTEM_ID, WH40KSettings.SETTINGS.pointBuyPool, {
            name: 'WH40K.SETTINGS.PointBuyPool.Name',
            hint: 'WH40K.SETTINGS.PointBuyPool.Hint',
            scope: 'world',
            config: true,
            default: 100,
            type: Number,
        });
        game.settings.register(SYSTEM_ID, WH40KSettings.SETTINGS.movementAutomation, {
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
        });
        game.settings.register(SYSTEM_ID, WH40KSettings.SETTINGS.multipleFateBurnPerRoll, {
            name: 'WH40K.SETTINGS.MultipleFateBurnPerRoll.Name',
            hint: 'WH40K.SETTINGS.MultipleFateBurnPerRoll.Hint',
            scope: 'world',
            config: true,
            default: false,
            type: Boolean,
        });
        game.settings.register(SYSTEM_ID, WH40KSettings.SETTINGS.resyncOnReady, {
            name: 'Resync Embedded Items From Compendiums on World Boot',
            hint: 'On every world load (GM only), reconcile every embedded item that originated from a compendium with its current source. Definition fields (description, mechanics, classification) are overwritten; per-actor state (skill advances, ammo counts, equipped flags, modifications, quantities) is preserved. Set flags.wh40k-rpg.frozenFromCompendium = true on a specific item to opt that one out.',
            scope: 'world',
            config: true,
            default: true,
            type: Boolean,
        });
        game.settings.register(SYSTEM_ID, WH40KSettings.SETTINGS.reconcileOriginGrantsOnReady, {
            name: 'Reconcile Origin-Path Grants on World Boot',
            hint: "On every world load (GM only), re-apply each actor's embedded origin paths idempotently so missing trained-skill grants self-heal without re-running character creation. Characteristic/wounds/fate contributions are reconciled against a recorded per-origin delta (no double-counting); skills, talents, and the origin item itself are skip-if-exists. Safe to run every boot.",
            scope: 'world',
            config: true,
            default: true,
            type: Boolean,
        });
    }
}
