function getTokenActor() {
    // Fetch the actor from the current users token or the actor collection.
    const speaker = ChatMessage.getSpeaker();
    let actor;
    if (speaker.token) actor = game.actors.tokens[speaker.token];
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
    console.log('Create Item Macro');
    console.log(data);
    if (data.type !== 'Item') return ui.notifications.warn(`Data type must be item to create item macro`);
    if (!('system' in data)) return ui.notifications.warn('You can only create macro buttons for owned Items');
    const item = data.system;

    // Create the macro command
    const command = `game.dh.rollItemMacro("${item.name}");`;
    if (checkExistingMacro(item.name, command)) return;

    const macro = await Macro.create({
        name: item.name,
        type: 'script',
        img: item.img,
        command: command,
        flags: { 'dh.itemMacro': true },
    });
    if (macro) await game.user.assignHotbarMacro(macro, slot);
}

export function rollItemMacro(itemName) {
    if (!checkCanRollMacro(skillName)) return;
    const actor = getTokenActor();
    if (!actor) return;

    const item = actor ? actor.items.find((i) => i.name === itemName) : null;
    if (!item) return ui.notifications.warn(`Your controlled Actor does not have an item named ${itemName}`);
    return actor.rollItem(item.id);
}

export async function createSkillMacro(data, slot) {
    if (!checkMacroCanCreate()) return;

    const { skill, speciality, name } = data;

    // Setup macro data.
    let command = `game.dh.rollSkillMacro("${skill}");`;
    if (speciality) {
        command = `game.dh.rollSkillMacro("${skill}", "${speciality}");`;
    }
    if (checkExistingMacro(name, command)) return;

    const macro = await Macro.create({
        name,
        img: 'systems/dark-heresy-2nd/icons/talents/red/r_36.png',
        type: 'script',
        command,
        flags: { 'dh.skillMacro': true },
    });
    if (macro) await game.user.assignHotbarMacro(macro, slot);
}

export async function rollSkillMacro(skillName, speciality) {
    if (!checkCanRollMacro(skillName)) return;
    const actor = getTokenActor();
    if (!actor) return;

    const skill = actor ? actor.skills[skillName] : null;
    if (!skill) return ui.notifications.warn(`Your controlled Actor does not have a skill named ${skillName}`);
    await actor.rollSkill(skillName, speciality);
}

export async function createCharacteristicMacro(data, slot) {
    if (!checkMacroCanCreate()) return;

    const { characteristic, name } = data;

    // Create the macro command
    const command = `game.dh.rollCharacteristicMacro("${characteristic}");`;
    if (checkExistingMacro(name, command)) return;

    const macro = await Macro.create({
        name,
        img: 'systems/dark-heresy-2nd/icons/talents/violet/p_05.png',
        type: 'script',
        command,
        flags: { 'dh.characteristicMacro': true },
    });
    if (macro) await game.user.assignHotbarMacro(macro, slot);
}

export async function rollCharacteristicMacro(characteristic) {
    if (!checkCanRollMacro(characteristic)) return;
    const actor = getTokenActor();
    if (!actor) return;

    const charCheck = actor ? actor.characteristics[characteristic] : null;
    if (!charCheck) return ui.notifications.warn(`Your controlled Actor does not have a characteristic named ${characteristic}`);
    await actor.rollCharacteristic(characteristic);
}
