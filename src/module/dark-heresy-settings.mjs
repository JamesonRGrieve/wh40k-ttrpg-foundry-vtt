import { SYSTEM_ID } from './hooks-manager.mjs';

export class DarkHeresySettings {

    static SETTINGS = {
        worldVersion: 'world-version',
        processActiveEffectsDuringCombat: 'active-effects-during-combat',

    }

    static registerSettings() {
        game.settings.register(SYSTEM_ID, DarkHeresySettings.SETTINGS.worldVersion, {
            name: 'World Version',
            hint: 'Used to handle data migration during system upgrades.',
            scope: 'world',
            config: true,
            requiresReload: true,
            default: 0,
            type: Number,
        })
        game.settings.register(SYSTEM_ID, DarkHeresySettings.SETTINGS.processActiveEffectsDuringCombat, {
            name: 'Active Effect Processing',
            hint: 'Process effects like Fire or Blood Loss on combat turn change.',
            scope: 'world',
            config: true,
            requiresReload: true,
            default: true,
            type: Boolean,
        })
    }
}
