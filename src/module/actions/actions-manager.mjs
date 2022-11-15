import { DHTargetedActionManager } from './targetted-action-manager.mjs';
import { DHBasicActionManager } from './basic-action-manager.mjs';
import { sendRollDataToChat } from '../rolls/roll-helpers.mjs';

export function initializeActorActions() {
    DHBasicActionManager.initializeHooks();
    DHTargetedActionManager.initializeHooks();
}

export async function performDamageAndSendToChat(rollData) {
    rollData.template = 'systems/dark-heresy-2nd/templates/chat/damage-roll-chat.hbs';
    rollData.roll = new Roll(rollData.damage, rollData);
    await sendRollDataToChat(rollData);
}

/**
 * @param attackData {AttackData}
 */
export async function performAttack(attackData) {
    // Finalize Modifiers
    await attackData.rollData.calculateTotalModifiers();

    // Determine Success/Hits
    await attackData.calculateSuccessOrFailure();

    // Send to Chat
    await sendRollDataToChat(attackData.rollData);
}
