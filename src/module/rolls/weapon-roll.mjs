import { getDegree } from './roll-helpers.mjs';

/**
 * RollData requires --
 *
 * sourceActor
 * weapon
 * destinationActor
 * combatAction
 * modifiers
 *
 * @param rollData
 * @returns {Promise<void>}
 */
export async function weaponRoll(rollData) {

    await _computeTarget(rollData);
    await _rollTarget(rollData);
    await _sendToChat(rollData);

}

async function _computeTarget(rollData) {
    const formula = `0 + ${rollData.difficulty} + ${rollData.modifier} + ${rollData.attackModifier}`;
    let r = new Roll(formula, {});
    await r.evaluate({ async: true });
    if (r.total > 60) {
        rollData.target = rollData.baseTarget + 60;
    } else if (r.total < -60) {
        rollData.target = rollData.baseTarget + -60;
    } else {
        rollData.target = rollData.baseTarget + r.total;
    }
    rollData.rollObject = r;
}

async function _rollTarget(rollData) {
    let r = new Roll('1d100', {});
    await r.evaluate({ async: true });
    rollData.result = r.total;
    rollData.rollObject = r;
    rollData.isSuccess = rollData.result <= rollData.target;
    if (rollData.isSuccess) {
        rollData.dof = 0;
        rollData.dos = 1 + getDegree(rollData.target, rollData.result);
    } else {
        rollData.dos = 0;
        rollData.dof = 1 + getDegree(rollData.result, rollData.target);
    }
}

async function _sendToChat(rollData) {
    rollData.render = await rollData.rollObject.render();

    const html = await renderTemplate('systems/dark-heresy-2nd/templates/chat/weapon-roll-chat.hbs', rollData);
    let chatData = {
        user: game.user.id,
        rollMode: game.settings.get('core', 'rollMode'),
        content: html,
        type: CONST.CHAT_MESSAGE_TYPES.ROLL,
    };
    if (rollData.rollObject) {
        chatData.roll = rollData.rollObject;
    }
    if (['gmroll', 'blindroll'].includes(chatData.rollMode)) {
        chatData.whisper = ChatMessage.getWhisperRecipients('GM');
    } else if (chatData.rollMode === 'selfroll') {
        chatData.whisper = [game.user];
    }
    ChatMessage.create(chatData);
}

