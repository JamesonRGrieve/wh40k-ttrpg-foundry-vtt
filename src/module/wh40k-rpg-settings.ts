import { SYSTEM_ID } from './constants.ts';

export type DH2Ruleset = 'raw' | 'homebrew';

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
        resyncOnReady: 'resync-on-ready',
    };

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
        game.settings.register(SYSTEM_ID, WH40KSettings.SETTINGS.resyncOnReady, {
            name: 'Resync Embedded Items From Compendiums on World Boot',
            hint: 'On every world load (GM only), reconcile every embedded item that originated from a compendium with its current source. Definition fields (description, mechanics, classification) are overwritten; per-actor state (skill advances, ammo counts, equipped flags, modifications, quantities) is preserved. Set flags.wh40k-rpg.frozenFromCompendium = true on a specific item to opt that one out.',
            scope: 'world',
            config: true,
            default: true,
            type: Boolean,
        });
    }
}
