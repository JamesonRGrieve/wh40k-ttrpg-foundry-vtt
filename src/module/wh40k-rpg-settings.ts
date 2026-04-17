import { SYSTEM_ID } from './constants.ts';

export class WH40KSettings {
    static SETTINGS = {
        worldVersion: 'world-version',
        simpleAttackRolls: 'simple-attack-rolls',
        simplePsychicRolls: 'simple-psychic-rolls',
        processActiveEffectsDuringCombat: 'active-effects-during-combat',
        combatPresets: 'combat-presets',
        movementAutomation: 'movement-automation',
    };

    static registerSettings(): void {
        // @ts-expect-error - argument type
        game.settings.register(SYSTEM_ID, WH40KSettings.SETTINGS.worldVersion, {
            name: 'World Version',
            hint: 'Used to handle data migration during system upgrades.',
            scope: 'world',
            config: true,
            requiresReload: true,
            default: 0,
            type: Number,
        });
        // @ts-expect-error - argument type
        game.settings.register(SYSTEM_ID, WH40KSettings.SETTINGS.processActiveEffectsDuringCombat, {
            name: 'Active Effect Processing',
            hint: 'Process effects like Fire or Blood Loss on combat turn change.',
            scope: 'world',
            config: true,
            requiresReload: true,
            default: true,
            type: Boolean,
        });
        // @ts-expect-error - argument type
        game.settings.register(SYSTEM_ID, WH40KSettings.SETTINGS.simpleAttackRolls, {
            name: 'Simple Attack Rolls',
            hint: 'Changes the default weapon automation behavior to disabled. Attack rolls will trigger a WeaponSkill or BallisticSkill roll as needed.',
            scope: 'client',
            config: true,
            requiresReload: true,
            default: false,
            type: Boolean,
        });
        // @ts-expect-error - argument type
        game.settings.register(SYSTEM_ID, WH40KSettings.SETTINGS.simplePsychicRolls, {
            name: 'Simple Psychic Rolls',
            hint: 'Changes the default psychic power automation behavior to disabled. Psychic rolls will trigger a simple WillPower roll.',
            scope: 'client',
            config: true,
            requiresReload: true,
            default: false,
            type: Boolean,
        });
        // @ts-expect-error - argument type
        game.settings.register(SYSTEM_ID, WH40KSettings.SETTINGS.combatPresets, {
            name: 'Combat Presets',
            hint: 'Saved NPC combat presets (templates).',
            scope: 'world',
            config: false,
            default: [],
            type: Array,
        });
        // @ts-expect-error - argument type
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
    }
}
