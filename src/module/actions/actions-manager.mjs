import { DHTargetedActionManager } from './targeted-action-manager.mjs';
import { DHBasicActionManager } from './basic-action-manager.mjs';
import { DHCombatActionManager } from './combat-action-manager.mjs';
import { SYSTEM_ID } from '../hooks-manager.mjs';
import { DarkHeresySettings } from '../dark-heresy-settings.mjs';

export function initializeActorActions() {
    DHTargetedActionManager.initializeHooks();
    DHBasicActionManager.initializeHooks();

    console.log('Initialize:', game.settings.get(SYSTEM_ID, DarkHeresySettings.SETTINGS.processActiveEffectsDuringCombat));
    if (game.settings.get(SYSTEM_ID, DarkHeresySettings.SETTINGS.processActiveEffectsDuringCombat)) {
        DHCombatActionManager.initializeHooks();
    }
}
