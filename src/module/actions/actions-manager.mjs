import { DHTargetedActionManager } from './targeted-action-manager.mjs';
import { DHBasicActionManager } from './basic-action-manager.mjs';

export function initializeActorActions() {
    DHTargetedActionManager.initializeHooks();
    DHBasicActionManager.initializeHooks();
}
