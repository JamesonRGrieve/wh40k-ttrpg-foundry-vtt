import { getDegree } from './roll-helpers.mjs';

/**
 * RollData requires --
 * sourceActor
 * weapon
 * destinationActor
 * combatAction
 * modifiers
 * result
 * isSuccess
 * dos/dof
 *
 * @param rollData
 * @returns {Promise<void>}
 */
export async function damageRoll(rollData) {
    await _computeBaseDamage(rollData);
    await _sendToChat(rollData);
}

async function _computeBaseDamage(rollData) {
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

