import { roll1d100 } from '../rolls/roll-helpers.mjs';

export async function handleBleeding(actor) {
    const context = {
        template: 'systems/dark-heresy-2nd/templates/chat/bleeding-chat.hbs',
        actor: actor
    }
    await sendActiveEffectMessage(context);
}

export async function handleOnFire(actor) {
    const context = {
        template: 'systems/dark-heresy-2nd/templates/chat/burning-chat.hbs',
        actor: actor,
        roll: await roll1d100(),
        target: actor.characteristics.willpower.total
    }
    const rollTotal = context.roll.total;
    context.success = rollTotal === 1 || (rollTotal <= context.target && rollTotal !== 100);

    const damageRoll = new Roll('1d10', {});
    await damageRoll.evaluate({ async: true });
    context.damage = damageRoll.total;
    await sendActiveEffectMessage(context);
}

export async function sendActiveEffectMessage(activeContext) {
    const html = await renderTemplate(activeContext.template, activeContext);
    let chatData = {
        user: game.user.id,
        rollMode: game.settings.get('core', 'rollMode'),
        content: html,
        type: CONST.CHAT_MESSAGE_TYPES.ROLL,
    };
    if (['gmroll', 'blindroll'].includes(chatData.rollMode)) {
        chatData.whisper = ChatMessage.getWhisperRecipients('GM');
    } else if (chatData.rollMode === 'selfroll') {
        chatData.whisper = [game.user];
    }
    ChatMessage.create(chatData);
}
