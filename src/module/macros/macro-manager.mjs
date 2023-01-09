function getTokenActor(actorId) {
    // Fetch the actor from the current users token or the actor collection.
    const speaker = ChatMessage.getSpeaker();
    let actor;
    if (actorId) actor = game.actors.get(actorId);
    if (!actor && speaker.token) actor = game.actors.tokens[speaker.token];
    if (!actor) actor = game.actors.get(speaker.actor);
    if (!actor) return ui.notifications.warn(`Cannot find controlled Actor. Is an Actor selector and do you have permissions?`);
    return actor;
}

function checkCanRollMacro(data) {
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

function checkExistingMacro(name, command) {
    let existingMacro = game.macros.find((m) => m.name === name && m.command === command);
    if (existingMacro) {
        ui.notifications.warn(`Macro already exists`);
        return true;
    } else {
        return false;
    }
}

export async function createItemMacro(data, slot) {
    if (!checkMacroCanCreate()) return;

    let macroName = `${data.actorName}: ${data.data.name}`;
    // Create the macro command
    const command = `game.dh.rollItemMacro("${data.actorId}", "${data.data._id}");`;
    if (checkExistingMacro(macroName, command)) return;

    const macro = await Macro.create({
        name: macroName,
        type: 'script',
        img: data.data.img,
        command: command,
        flags: { 'dh.itemMacro': true },
    });
    if (macro) await game.user.assignHotbarMacro(macro, slot);
}

export function rollItemMacro(actorId, itemId) {
    game.dh.log('RollItemMacro');
    if (!checkCanRollMacro(itemId)) return;
    const actor = getTokenActor(actorId);
    if (!actor) return;

    const item = actor ? actor.items.find((i) => i._id === itemId) : null;
    if (!item) return ui.notifications.warn(`Actor does not have an item id: ${itemId}`);
    return actor.rollItem(item._id);
}

export async function createSkillMacro(data, slot) {
    if (!checkMacroCanCreate()) return;

    const { skill, speciality, name } = data.data;
    let macroName = `${data.actorName}: ${name}`;
    game.dh.log('Creating macro with name: ' + macroName);

    // Setup macro data.
    let command = `game.dh.rollSkillMacro("${data.actorId}", "${skill}");`;
    if (speciality) {
        command = `game.dh.rollSkillMacro("${data.actorId}", "${skill}", "${speciality}");`;
    }
    if (checkExistingMacro(macroName, command)) return;

    const macro = await Macro.create({
        name: macroName,
        img: 'systems/dark-heresy-2nd/icons/talents/red/r_36.png',
        type: 'script',
        command: command,
        flags: { 'dh.skillMacro': true },
    });
    if (macro) await game.user.assignHotbarMacro(macro, slot);
}

export async function rollSkillMacro(actorId, skillName, speciality) {
    if (!checkCanRollMacro(skillName)) return;
    const actor = getTokenActor(actorId);
    if (!actor) return;

    const skill = actor ? actor.skills[skillName] : null;
    if (!skill) return ui.notifications.warn(`Your controlled Actor does not have a skill named ${skillName}`);
    await actor.rollSkill(skillName, speciality);
}

export async function createCharacteristicMacro(data, slot) {
    if (!checkMacroCanCreate()) return;

    const { characteristic, name } = data.data;
    const macroName = `${data.actorName}: ${name}`;

    // Create the macro command
    const command = `game.dh.rollCharacteristicMacro("${data.actorId}","${characteristic}");`;
    if (checkExistingMacro(macroName, command)) return;

    const macro = await Macro.create({
        name: macroName,
        img: 'systems/dark-heresy-2nd/icons/talents/violet/p_05.png',
        type: 'script',
        command: command,
        flags: { 'dh.characteristicMacro': true },
    });
    if (macro) await game.user.assignHotbarMacro(macro, slot);
}

export async function rollCharacteristicMacro(actorId, characteristic) {
    if (!checkCanRollMacro(characteristic)) return;
    const actor = getTokenActor(actorId);
    if (!actor) return;

    const charCheck = actor ? actor.characteristics[characteristic] : null;
    if (!charCheck) return ui.notifications.warn(`Your controlled Actor does not have a characteristic named ${characteristic}`);
    await actor.rollCharacteristic(characteristic);
}
