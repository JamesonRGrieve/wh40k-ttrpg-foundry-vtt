import { prepareSimpleRoll } from './simple-prompt.mjs';

export async function createItemMacro(data, slot) {
  if (data.type !== 'Item') return;
  if (!('system' in data)) return ui.notifications.warn('You can only create macro buttons for owned Items');
  const item = data.system;

  // Create the macro command
  const command = `game.dh.rollItemMacro("${item.name}");`;
  let existingMacro = game.macros.find((m) => m.name === item.name && m.command === command);
  if (existingMacro) return;

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
  const speaker = ChatMessage.getSpeaker();
  let actor;
  if (speaker.token) actor = game.actors.tokens[speaker.token];
  if (!actor) actor = game.actors.get(speaker.actor);
  const item = actor ? actor.items.find((i) => i.name === itemName) : null;
  if (!item) return ui.notifications.warn(`Your controlled Actor does not have an item named ${itemName}`);

  // Trigger the item roll
  return actor.rollItem(item.id);
}

export async function createSkillMacro(data, slot) {
  if (!game.macros || !game.user) return;

  const { skill, speciality, name } = data;

  // Setup macro data.
  let command = `game.dh.rollSkillMacro("${skill}");`;
  if (speciality) {
    command = `game.dh.rollSkillMacro("${skill}", "${speciality}");`;
  }

  let existingMacro = game.macros.find((m) => m.name === name && m.command === command);
  if (existingMacro) return;

  const macro = await Macro.create({
    name,
    img: 'systems/dark-heresy-2nd/icons/talents/red/r_36.png',
    type: 'script',
    command,
    // TODO: Is flags needed here? See createItemMacro
  });
  if (macro) await game.user.assignHotbarMacro(macro, slot);
}

export async function rollSkillMacro(skillName, speciality) {
  if (!game || !game.actors) return;
  if (!skillName) return;

  // Fetch the actor from the current users token or the actor collection.
  const speaker = ChatMessage.getSpeaker();
  let actor;
  if (speaker.token) actor = game.actors.tokens[speaker.token];
  if (!actor) actor = game.actors.get(speaker.actor);
  const skill = actor ? actor.skills[skillName] : null;
  if (!skill) return ui.notifications.warn(`Your controlled Actor does not have a skill named ${skillName}`);
  await prepareSimpleRoll(await actor.rollSkill(skillName, speciality));
}

export async function createCharacteristicMacro(data, slot) {
  if (!game.macros || !game.user) return;

  const { characteristic, name } = data;

  // Create the macro command
  const command = `game.dh.rollCharacteristicMacro("${characteristic}");`;
  let existingMacro = game.macros.find((m) => m.name === name && m.command === command);
  if (existingMacro) return;

  const macro = await Macro.create({
    name,
    img: 'systems/dark-heresy-2nd/icons/talents/violet/p_05.png',
    type: 'script',
    command,
  });
  if (macro) await game.user.assignHotbarMacro(macro, slot);
}

export async function rollCharacteristicMacro(characteristic) {
  console.log(characteristic);
  if (!game || !game.actors) return;
  if (!characteristic) return;

  // Fetch the actor from the current users token or the actor collection.
  const speaker = ChatMessage.getSpeaker();
  let actor;
  if (speaker.token) actor = game.actors.tokens[speaker.token];
  if (!actor) actor = game.actors.get(speaker.actor);
  console.log(actor.characteristics);
  const charCheck = actor ? actor.characteristics[characteristic] : null;
  if (!charCheck) return ui.notifications.warn(`Your controlled Actor does not have a characteristic named ${characteristic}`);

  await prepareSimpleRoll(await actor.rollCharacteristic(characteristic));
}
