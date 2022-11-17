import { DHTargetedActionManager } from './targetted-action-manager.mjs';
import { DHBasicActionManager } from './basic-action-manager.mjs';
import { sendAttackDataToChat } from '../rolls/roll-helpers.mjs';
import { useAmmo } from '../rules/ammo.mjs';

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

    game.dh.log('Attack Data', attackData);

    // Expend Ammo
    await useAmmo(attackData);

    // Render Attack Roll
    attackData.rollData.render = await attackData.rollData.roll.render();
    attackData.template = attackData.rollData.template;

    // Send to Chat
    await sendAttackDataToChat(attackData);
}
