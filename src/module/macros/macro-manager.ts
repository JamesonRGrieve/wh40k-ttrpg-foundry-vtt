function getTokenActor(actorId: string | undefined) {
    // Fetch the actor from the current users token or the actor collection.
    const speaker = ChatMessage.getSpeaker();
    let actor: Actor | null | undefined;
    if (actorId) actor = game.actors.get(actorId) as Actor | undefined;
    if (!actor && speaker.token) actor = (game.actors as unknown as { tokens: Record<string, Actor> }).tokens[speaker.token];
    if (!actor) actor = game.actors.get(speaker.actor as string) as Actor | undefined;
    if (!actor) return ui.notifications.warn(`Cannot find controlled Actor. Is an Actor selector and do you have permissions?`);
    return actor;
}

function checkCanRollMacro(data: unknown) {
    if (!game || !game.actors) {
        ui.notifications.warn(`Game or Actors not found. Unable to perform roll`);
        return false;
    } else if (!data) {
        ui.notifications.warn(`Must provide data to perform roll`);
        return false;
    } else {
        return true;
    }
}

function checkMacroCanCreate() {
    if (!game.macros || !game.user) {
        ui.notifications.warn(`Game or User not found. Unable to create macro`);
        return false;
    } else {
        return true;
    }
}

function checkExistingMacro(name: string, command: string) {
    const existingMacro = game.macros.find((m) => m.name === name && m.command === command);
    if (existingMacro) {
        ui.notifications.warn(`Macro already exists`);
        return true;
    } else {
        return false;
    }
}

export async function createItemMacro(data: Record<string, unknown>, slot: number) {
    if (!checkMacroCanCreate()) return;

    const macroData = data.data as Record<string, unknown>;
    const macroName = `${data.actorName}: ${macroData.name}`;
    // Create the macro command
    const command = `game.wh40k.rollItemMacro("${data.actorId}", "${macroData._id}");`;
    if (checkExistingMacro(macroName, command)) return;

    const macro = await Macro.create({
        name: macroName,
        type: 'script',
        img: macroData.img as string,
        command: command,
        flags: { dh: { itemMacro: true } } as Record<string, unknown>,
    });
    if (macro) await game.user.assignHotbarMacro(macro as Macro<'script' | 'chat'>, slot);
}

export function rollItemMacro(actorId: string, itemId: string) {
    (game as unknown as { wh40k: { log: (s: string) => void } }).wh40k.log('RollItemMacro');
    if (!checkCanRollMacro(itemId)) return undefined;
    const actor = getTokenActor(actorId);
    if (!actor) return undefined;

    const item = actor ? actor.items.find((i) => i._id === itemId) : null;
    if (!item) {
        ui.notifications.warn(`Actor does not have an item id: ${itemId}`);
        return undefined;
    }
    return (actor as unknown as { rollItem: (id: string) => unknown }).rollItem(item._id ?? '');
}

export async function createSkillMacro(data: Record<string, unknown>, slot: number) {
    if (!checkMacroCanCreate()) return;

    const macroData = data.data as Record<string, unknown>;
    const { skill, speciality, name } = macroData as { skill: string; speciality?: string; name: string };
    const macroName = `${data.actorName}: ${name}`;
    (game as unknown as { wh40k: { log: (s: string) => void } }).wh40k.log(`Creating macro with name: ${macroName}`);

    // Setup macro data.
    let command = `game.wh40k.rollSkillMacro("${data.actorId}", "${skill}");`;
    if (speciality) {
        command = `game.wh40k.rollSkillMacro("${data.actorId}", "${skill}", "${speciality}");`;
    }
    if (checkExistingMacro(macroName, command)) return;

    const macro = await Macro.create({
        name: macroName,
        img: 'systems/wh40k-rpg/icons/talents/red/r_36.png',
        type: 'script',
        command: command,
        flags: { dh: { skillMacro: true } } as Record<string, unknown>,
    });
    if (macro) await game.user.assignHotbarMacro(macro as Macro<'script' | 'chat'>, slot);
}

export async function rollSkillMacro(actorId: string, skillName: string, speciality?: string) {
    if (!checkCanRollMacro(skillName)) return;
    const actor = getTokenActor(actorId);
    if (!actor) return;

    const actorExt = actor as unknown as {
        getSkillFuzzy?: (s: string) => unknown;
        skills?: Record<string, unknown>;
        rollSkill: (s: string, sp?: string) => Promise<void>;
    };
    const skill = actorExt.getSkillFuzzy ? actorExt.getSkillFuzzy(skillName) : actorExt.skills?.[skillName];
    if (!skill) {
        ui.notifications.warn(`Your controlled Actor does not have a skill named ${skillName}`);
        return;
    }
    await actorExt.rollSkill(skillName, speciality);
}

export async function createCharacteristicMacro(data: Record<string, unknown>, slot: number) {
    if (!checkMacroCanCreate()) return;

    const macroData = data.data as Record<string, unknown>;
    const { characteristic, name } = macroData as { characteristic: string; name: string };
    const macroName = `${data.actorName}: ${name}`;

    // Create the macro command
    const command = `game.wh40k.rollCharacteristicMacro("${data.actorId}","${characteristic}");`;
    if (checkExistingMacro(macroName, command)) return;

    const macro = await Macro.create({
        name: macroName,
        img: 'systems/wh40k-rpg/icons/talents/violet/p_05.png',
        type: 'script',
        command: command,
        flags: { dh: { characteristicMacro: true } } as Record<string, unknown>,
    });
    if (macro) await game.user.assignHotbarMacro(macro as Macro<'script' | 'chat'>, slot);
}

export async function rollCharacteristicMacro(actorId: string, characteristic: string) {
    if (!checkCanRollMacro(characteristic)) return;
    const actor = getTokenActor(actorId);
    if (!actor) return;

    const actorExt = actor as unknown as { characteristics: Record<string, unknown>; rollCharacteristic: (c: string) => Promise<void> };
    const charCheck = actorExt.characteristics[characteristic];
    if (!charCheck) {
        ui.notifications.warn(`Your controlled Actor does not have a characteristic named ${characteristic}`);
        return;
    }
    await actorExt.rollCharacteristic(characteristic);
}
