export function getDegree(a, b) {
    return Math.floor(a / 10) - Math.floor(b / 10);
}

export async function roll1d100() {
    let formula = '1d100';
    const roll = new Roll(formula, {});
    await roll.evaluate({ async: true });
    return roll;
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

export function recursiveUpdate(targetObject, updateObject) {
    for (const key of Object.keys(updateObject)) {
        handleDotNotationUpdate(targetObject, key, updateObject[key]);
    }
}

export function handleDotNotationUpdate(targetObject, key, value) {
    if (typeof key == 'string') {
        // Key Starts as string and we split across dots
        handleDotNotationUpdate(targetObject, key.split('.'), value);
    } else if (key.length === 1) {
        // Final Key -- either delete or set parent field
        if (value === undefined || value === null) {
            delete targetObject[key[0]];
        } else if ('object' === typeof value && !Array.isArray(value)) {
            recursiveUpdate(targetObject[key[0]], value);
        } else {
            // Coerce numbers
            if ('number' === typeof targetObject[key[0]]) {
                targetObject[key[0]] = Number(value);
            } else {
                targetObject[key[0]] = value;
            }
        }
    } else {
        // Go a layer deeper into object
        handleDotNotationUpdate(targetObject[key[0]], key.slice(1), value);
    }
}
