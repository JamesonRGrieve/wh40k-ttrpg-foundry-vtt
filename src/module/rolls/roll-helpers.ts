import type { ActionData } from './action-data.ts';

// eslint-disable-next-line no-restricted-syntax -- boundary: recursive dot-notation traversal; values are unknown by design
type DotNotationTarget = Record<string, unknown>;
type DotNotationKey = string | string[];

export function uuid(): string {
    const chars = '0123456789abcdef'.split('');

    const uuidStr: string[] = [],
        rnd = Math.random;
    let r: number;
    uuidStr[8] = uuidStr[13] = uuidStr[18] = uuidStr[23] = '-';
    uuidStr[14] = '4'; // version 4

    for (let i = 0; i < 36; i++) {
        if (!uuidStr[i]) {
            r = 0 | (rnd() * 16);
            const idx = i === 19 ? (r & 0x3) | 0x8 : r & 0xf;
            uuidStr[i] = chars[idx] ?? '0';
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

export async function roll1d100(): Promise<Roll> {
    const formula = '1d100';
    const roll = new Roll(formula, {});
    await roll.evaluate();
    return roll;
}

/**
 * Apply whisper recipients to a chatData object based on the current rollMode.
 * Mutates chatData in place.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ChatMessage.create accepts an untyped record-shaped payload
export function applyRollModeWhispers(chatData: Record<string, unknown>): void {
    const rollMode = chatData['rollMode'];
    if (typeof rollMode === 'string' && ['gmroll', 'blindroll'].includes(rollMode)) {
        chatData['whisper'] = ChatMessage.getWhisperRecipients('GM');
    } else if (rollMode === 'selfroll') {
        chatData['whisper'] = [game.user];
    }
}

export async function sendActionDataToChat(actionData: ActionData): Promise<void> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: renderTemplate expects a plain record; ActionData is duck-typed to satisfy the shape
    const html = await foundry.applications.handlebars.renderTemplate(actionData.template, actionData as unknown as Record<string, unknown>);
    // eslint-disable-next-line no-restricted-syntax -- boundary: ChatMessage.create accepts an untyped record-shaped payload
    const chatData: Record<string, unknown> = {
        user: game.user.id,
        rollMode: game.settings.get('core', 'rollMode'),
        content: html,
    };
    const rollData = actionData.rollData as typeof actionData.rollData & { isManualRoll?: boolean };
    if (rollData.roll != null && rollData.isManualRoll !== true) {
        chatData['rolls'] = [actionData.rollData.roll];
    }
    applyRollModeWhispers(chatData);
    await ChatMessage.create(chatData);
}

export function recursiveUpdate(targetObject: DotNotationTarget, updateObject: DotNotationTarget): void {
    for (const key of Object.keys(updateObject)) {
        handleDotNotationUpdate(targetObject, key, updateObject[key]);
    }
}

// eslint-disable-next-line no-restricted-syntax -- boundary: recursive dot-notation update traverses arbitrary nested unknown values
export function handleDotNotationUpdate(targetObject: DotNotationTarget, key: DotNotationKey, value: unknown): void {
    if (typeof key === 'string') {
        // Key Starts as string and we split across dots
        handleDotNotationUpdate(targetObject, key.split('.'), value);
    } else if (key.length === 1) {
        // Final Key -- either delete or set parent field
        const leafKey = key[0];
        if (!leafKey) return;
        if (value === undefined || value === null) {
            delete targetObject[leafKey];
        } else if ('object' === typeof value && !Array.isArray(value)) {
            const current = targetObject[leafKey];
            if (current != null && typeof current === 'object' && !Array.isArray(current)) {
                recursiveUpdate(current as DotNotationTarget, value as DotNotationTarget);
            } else {
                targetObject[leafKey] = value;
            }
        } else if ('number' === typeof targetObject[leafKey]) {
            // Coerce numbers
            targetObject[leafKey] = Number(value);
        } else {
            targetObject[leafKey] = value;
        }
    } else {
        // Go a layer deeper into object
        const [head, ...tail] = key;
        if (!head) return;
        const next = targetObject[head];
        if (next == null || typeof next !== 'object' || Array.isArray(next)) return;
        handleDotNotationUpdate(next as DotNotationTarget, tail, value);
    }
}
