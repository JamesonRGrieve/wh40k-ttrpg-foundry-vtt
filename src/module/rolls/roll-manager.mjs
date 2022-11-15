import { totalModifiers, determineSuccess, roll1d100 } from './roll-helpers.mjs';

export async function performDamageAndSendToChat(rollData) {
    rollData.template = 'systems/dark-heresy-2nd/templates/chat/damage-roll-chat.hbs';
    rollData.roll = new Roll(rollData.damage, rollData);

    await sendRollDataToChat(rollData);
}

export async function performRollAndSendToChat(attackData) {
    const rollData = attackData.rollData;
    rollData.modifierTotal = await totalModifiers(rollData.modifiers);
    rollData.roll = await roll1d100();
    const successData = determineSuccess(attackData);

    rollData.success = successData.success;
    rollData.dos = successData.dos;
    rollData.dof = successData.dof;

    await sendRollDataToChat(rollData);
}

export async function sendRollDataToChat(rollData) {
    rollData.render = await rollData.roll.render();
    const html = await renderTemplate(rollData.template, rollData);
    let chatData = {
        user: game.user.id,
        rollMode: game.settings.get('core', 'rollMode'),
        content: html,
        type: CONST.CHAT_MESSAGE_TYPES.ROLL,
    };
    if (rollData.roll) {
        chatData.roll = rollData.roll;
    }
    if (['gmroll', 'blindroll'].includes(chatData.rollMode)) {
        chatData.whisper = ChatMessage.getWhisperRecipients('GM');
    } else if (chatData.rollMode === 'selfroll') {
        chatData.whisper = [game.user];
    }
    ChatMessage.create(chatData);
}
