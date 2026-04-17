export function uuid(): string {
    const chars = '0123456789abcdef'.split('');

    const uuidStr = [],
        rnd = Math.random;
    let r;
    uuidStr[8] = uuidStr[13] = uuidStr[18] = uuidStr[23] = '-';
    uuidStr[14] = '4'; // version 4

    for (let i = 0; i < 36; i++) {
        if (!uuidStr[i]) {
            r = 0 | (rnd() * 16);

            uuidStr[i] = chars[i === 19 ? (r & 0x3) | 0x8 : r & 0xf];
        }
    }

    return uuidStr.join('');
}

export function getDegree(a: number, b: number): number {
    return Math.floor(a / 10) - Math.floor(b / 10);
}

export function getOpposedDegrees(dos: number, dof: number, opposedDos: number, opposedDof: number): number {
    if (dos > 0) {
        if (opposedDos > 0) {
            return dos - opposedDos;
        } else {
            return dos + opposedDof;
        }
    } else if (opposedDos > 0) {
        return -1 * (dof + opposedDos);
    } else {
        return -1 * (dof - opposedDof);
    }
}

export async function roll1d100(): Promise<any> {
    const formula = '1d100';
    const roll = new Roll(formula, {});
    await roll.evaluate();
    return roll;
}

/**
 * Apply whisper recipients to a chatData object based on the current rollMode.
 * Mutates chatData in place.
 */
export function applyRollModeWhispers(chatData: Record<string, any>): void {
    const rollMode = chatData.rollMode;
    if (['gmroll', 'blindroll'].includes(rollMode)) {
        chatData.whisper = ChatMessage.getWhisperRecipients('GM');
    } else if (rollMode === 'selfroll') {
        chatData.whisper = [game.user];
    }
}

export async function sendActionDataToChat(actionData: any): Promise<void> {
    const html = await foundry.applications.handlebars.renderTemplate(actionData.template, actionData);
    const chatData: Record<string, any> = {
        user: game.user.id,
        rollMode: game.settings.get('core', 'rollMode'),
        content: html,
    };
    if (actionData.rollData.roll && !actionData.rollData.isManualRoll) {
        chatData.rolls = [actionData.rollData.roll];
    }
    applyRollModeWhispers(chatData);
    await ChatMessage.create(chatData);
}

export function recursiveUpdate(targetObject: any, updateObject: any): void {
    for (const key of Object.keys(updateObject)) {
        handleDotNotationUpdate(targetObject, key, updateObject[key]);
    }
}

export function handleDotNotationUpdate(targetObject: any, key: string | string[], value: any): void {
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
