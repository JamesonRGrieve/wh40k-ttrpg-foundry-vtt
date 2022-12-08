import { SYSTEM_ID } from './hooks-manager.mjs';

export class DarkHeresySettings {

    static SETTINGS = {
        processActiveEffectsDuringCombat: 'active-effects-during-combat'
    }

    static registerSettings() {
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
