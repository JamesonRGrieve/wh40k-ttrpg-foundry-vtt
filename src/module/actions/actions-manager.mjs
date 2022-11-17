import { DHTargetedActionManager } from './targetted-action-manager.mjs';
import { DHBasicActionManager } from './basic-action-manager.mjs';

export function initializeActorActions() {
    DHBasicActionManager.initializeHooks();
    DHTargetedActionManager.initializeHooks();
}

