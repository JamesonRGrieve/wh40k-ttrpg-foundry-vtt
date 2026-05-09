function getTokenActor(actorId: string | undefined): Actor | undefined {
    // Fetch the actor from the current users token or the actor collection.
    const speaker = ChatMessage.getSpeaker();
    let actor: Actor | null | undefined;
    if (actorId !== undefined && actorId !== '') actor = game.actors.get(actorId);
    if (actor === null || actor === undefined) {
        const tokenId = speaker.token;
        if (tokenId !== undefined && tokenId !== null && tokenId !== '') {
            actor = (game.actors as unknown as { tokens: Record<string, Actor> }).tokens[tokenId];
        }
    }
    if ((actor === null || actor === undefined) && typeof speaker.actor === 'string') actor = game.actors.get(speaker.actor);
    if (actor === null || actor === undefined) {
        ui.notifications.warn(`Cannot find controlled Actor. Is an Actor selector and do you have permissions?`);
        return undefined;
    }
    return actor;
}

function checkCanRollMacro(data: unknown): boolean {
    if (game.actors === undefined) {
        ui.notifications.warn(`Game or Actors not found. Unable to perform roll`);
        return false;
    } else if (data === undefined || data === null || data === '') {
        ui.notifications.warn(`Must provide data to perform roll`);
        return false;
    }
    return true;
}

function checkMacroCanCreate(): boolean {
    if (game.macros === undefined || game.user === undefined) {
        ui.notifications.warn(`Game or User not found. Unable to create macro`);
        return false;
    }
    return true;
}

function checkExistingMacro(name: string, command: string): boolean {
    const existingMacro = game.macros.find((m) => m.name === name && m.command === command);
    if (existingMacro !== undefined) {
        ui.notifications.warn(`Macro already exists`);
        return true;
    }
    return false;
}

export async function createItemMacro(data: Record<string, unknown>, slot: number): Promise<void> {
    if (!checkMacroCanCreate()) return;

    const macroData = data.data as Record<string, unknown>;
    const macroName = `${data.actorName as string}: ${macroData.name as string}`;
    // Create the macro command
    const command = `game.wh40k.rollItemMacro("${data.actorId as string}", "${macroData._id as string}");`;
    if (checkExistingMacro(macroName, command)) return;

    // eslint-disable-next-line no-restricted-syntax -- boundary: system-scoped flag namespace 'dh' is not declared in fvtt-types CoreFlags
    const macro = (await Macro.create({
        name: macroName,
        type: 'script',
        img: macroData.img as string,
        command: command,
        flags: { dh: { itemMacro: true } } as unknown as Record<string, unknown>,
    })) as unknown as Macro<'script' | 'chat'> | null;
    if (macro !== null && macro !== undefined) await game.user.assignHotbarMacro(macro, slot);
}

export function rollItemMacro(actorId: string, itemId: string): unknown {
    (game as unknown as { wh40k: { log: (s: string) => void } }).wh40k.log('RollItemMacro');
    if (!checkCanRollMacro(itemId)) return undefined;
    const actor = getTokenActor(actorId);
    if (actor === undefined) return undefined;

    const item = actor.items.find((i) => i._id === itemId);
    if (item === undefined) {
        ui.notifications.warn(`Actor does not have an item id: ${itemId}`);
        return undefined;
    }
    return (actor as unknown as { rollItem: (id: string) => unknown }).rollItem(item._id ?? '');
}

export async function createSkillMacro(data: Record<string, unknown>, slot: number): Promise<void> {
    if (!checkMacroCanCreate()) return;

    const macroData = data.data as Record<string, unknown>;
    const { skill, speciality, name } = macroData as { skill: string; speciality?: string; name: string };
    const macroName = `${data.actorName as string}: ${name}`;
    (game as unknown as { wh40k: { log: (s: string) => void } }).wh40k.log(`Creating macro with name: ${macroName}`);

    // Setup macro data.
    let command = `game.wh40k.rollSkillMacro("${data.actorId as string}", "${skill}");`;
    if (speciality !== undefined && speciality !== '') {
        command = `game.wh40k.rollSkillMacro("${data.actorId as string}", "${skill}", "${speciality}");`;
    }
    if (checkExistingMacro(macroName, command)) return;

    // eslint-disable-next-line no-restricted-syntax -- boundary: system-scoped flag namespace 'dh' is not declared in fvtt-types CoreFlags
    const macro = (await Macro.create({
        name: macroName,
        img: 'systems/wh40k-rpg/icons/talents/red/r_36.png',
        type: 'script',
        command: command,
        flags: { dh: { skillMacro: true } } as unknown as Record<string, unknown>,
    })) as unknown as Macro<'script' | 'chat'> | null;
    if (macro !== null && macro !== undefined) await game.user.assignHotbarMacro(macro, slot);
}

export async function rollSkillMacro(actorId: string, skillName: string, speciality?: string): Promise<void> {
    if (!checkCanRollMacro(skillName)) return;
    const actor = getTokenActor(actorId);
    if (actor === undefined) return;

    const actorExt = actor as unknown as {
        getSkillFuzzy?: (s: string) => unknown;
        skills?: Record<string, unknown>;
        rollSkill: (s: string, sp?: string) => Promise<void>;
    };
    const skill = actorExt.getSkillFuzzy !== undefined ? actorExt.getSkillFuzzy(skillName) : actorExt.skills?.[skillName];
    if (skill === undefined || skill === null) {
        ui.notifications.warn(`Your controlled Actor does not have a skill named ${skillName}`);
        return;
    }
    await actorExt.rollSkill(skillName, speciality);
}

export async function createCharacteristicMacro(data: Record<string, unknown>, slot: number): Promise<void> {
    if (!checkMacroCanCreate()) return;

    const macroData = data.data as Record<string, unknown>;
    const { characteristic, name } = macroData as { characteristic: string; name: string };
    const macroName = `${data.actorName as string}: ${name}`;

    // Create the macro command
    const command = `game.wh40k.rollCharacteristicMacro("${data.actorId as string}","${characteristic}");`;
    if (checkExistingMacro(macroName, command)) return;

    // eslint-disable-next-line no-restricted-syntax -- boundary: system-scoped flag namespace 'dh' is not declared in fvtt-types CoreFlags
    const macro = (await Macro.create({
        name: macroName,
        img: 'systems/wh40k-rpg/icons/talents/violet/p_05.png',
        type: 'script',
        command: command,
        flags: { dh: { characteristicMacro: true } } as unknown as Record<string, unknown>,
    })) as unknown as Macro<'script' | 'chat'> | null;
    if (macro !== null && macro !== undefined) await game.user.assignHotbarMacro(macro, slot);
}

export async function rollCharacteristicMacro(actorId: string, characteristic: string): Promise<void> {
    if (!checkCanRollMacro(characteristic)) return;
    const actor = getTokenActor(actorId);
    if (actor === undefined) return;

    const actorExt = actor as unknown as { characteristics: Record<string, unknown>; rollCharacteristic: (c: string) => Promise<void> };
    const charCheck = actorExt.characteristics[characteristic];
    if (charCheck === undefined || charCheck === null) {
        ui.notifications.warn(`Your controlled Actor does not have a characteristic named ${characteristic}`);
        return;
    }
    await actorExt.rollCharacteristic(characteristic);
}
