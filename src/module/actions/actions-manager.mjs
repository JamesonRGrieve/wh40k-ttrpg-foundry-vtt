import { DHTargetedActionManager } from './targetted-action-manager.mjs';
import { DHBasicActionManager } from './basic-action-manager.mjs';
import { sendRollDataToChat } from '../rolls/roll-helpers.mjs';

export function initializeActorActions() {
    DHBasicActionManager.initializeHooks();
    DHTargetedActionManager.initializeHooks();
}

/**
 * @param attackData {AttackData}
 */
export async function performAttack(attackData) {
    // Finalize Modifiers
    await attackData.rollData.calculateTotalModifiers();

    // Determine Success/Hits
    await attackData.calculateSuccessOrFailure();

    // Calculate Hits
    await attackData.calculateHits();

    console.log('Attack Data', attackData);

    // Send to Chat
    await sendRollDataToChat(attackData.rollData);
}
