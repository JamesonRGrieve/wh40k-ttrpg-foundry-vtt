import { SYSTEM_ID } from './constants.mjs';

export class RogueTraderSettings {

    static SETTINGS = {
        worldVersion: 'world-version',
        simpleAttackRolls: 'simple-attack-rolls',
        simplePsychicRolls: 'simple-psychic-rolls',
        processActiveEffectsDuringCombat: 'active-effects-during-combat',
        combatPresets: 'combat-presets',
        movementAutomation: 'movement-automation',
    }

    static registerSettings() {
        game.settings.register(SYSTEM_ID, RogueTraderSettings.SETTINGS.worldVersion, {
            name: 'World Version',
            hint: 'Used to handle data migration during system upgrades.',
            scope: 'world',
            config: true,
            requiresReload: true,
            default: 0,
            type: Number,
        });
        game.settings.register(SYSTEM_ID, RogueTraderSettings.SETTINGS.processActiveEffectsDuringCombat, {
            name: 'Active Effect Processing',
            hint: 'Process effects like Fire or Blood Loss on combat turn change.',
            scope: 'world',
            config: true,
            requiresReload: true,
            default: true,
            type: Boolean,
        });
        game.settings.register(SYSTEM_ID, RogueTraderSettings.SETTINGS.simpleAttackRolls, {
            name: 'Simple Attack Rolls',
            hint: 'Changes the default weapon automation behavior to disabled. Attack rolls will trigger a WeaponSkill or BallisticSkill roll as needed.',
            scope: 'client',
            config: true,
            requiresReload: true,
            default: false,
            type: Boolean,
        });
        game.settings.register(SYSTEM_ID, RogueTraderSettings.SETTINGS.simplePsychicRolls, {
            name: 'Simple Psychic Rolls',
            hint: 'Changes the default psychic power automation behavior to disabled. Psychic rolls will trigger a simple WillPower roll.',
            scope: 'client',
            config: true,
            requiresReload: true,
            default: false,
            type: Boolean,
        });
        game.settings.register(SYSTEM_ID, RogueTraderSettings.SETTINGS.combatPresets, {
            name: 'Combat Presets',
            hint: 'Saved NPC combat presets (templates).',
            scope: 'world',
            config: false,
            default: [],
            type: Array,
        });
        game.settings.register(SYSTEM_ID, RogueTraderSettings.SETTINGS.movementAutomation, {
            name: 'RT.SETTINGS.MovementAutomation.Name',
            hint: 'RT.SETTINGS.MovementAutomation.Hint',
            scope: 'world',
            config: true,
            default: 'full',
            type: String,
            choices: {
                full: 'RT.SETTINGS.MovementAutomation.Full',
                display: 'RT.SETTINGS.MovementAutomation.Display',
                none: 'RT.SETTINGS.MovementAutomation.None',
            },
        });
    }
}
