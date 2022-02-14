import { DarkHeresyActor } from "./documents/actor.mjs";
import { DarkHeresyItem } from "./documents/item.mjs";
import { AcolyteSheet } from "./sheets/acolyte-sheet.mjs";
import { DarkHeresyItemSheet } from "./sheets/item-sheet.mjs";
import { initializeHandlebars } from "./helpers/handlebars.mjs";
import { DarkHeresy } from "./helpers/config.mjs";
import {DarkHeresyWeaponSheet} from "./sheets/weapon-sheet.mjs";
import {DarkHeresyTalentSheet} from "./sheets/talent-sheet.mjs";
import {DarkHeresyArmourSheet} from "./sheets/armour-sheet.mjs";

/* -------------------------------------------- */
/*  Init Hook                                   */
/* -------------------------------------------- */

Hooks.once('init', async function() {

  // Add utility classes to the global game object so that they're more easily
  // accessible in global contexts.
  game.dh = {
    dhActor: DarkHeresyActor,
    dhItem: DarkHeresyItem,
    rollItemMacro
  };

  // Add custom constants for configuration.
  CONFIG.dh = DarkHeresy;
  CONFIG.Combat.initiative = { formula: "@initiative.base + @initiative.bonus", decimals: 0 };

  // Define custom Document classes
  CONFIG.Actor.documentClass = DarkHeresyActor;
  CONFIG.Item.documentClass = DarkHeresyItem;

  // Register sheet application classes
  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("dark-heresy-2nd", AcolyteSheet, { makeDefault: true });

  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("dark-heresy-2nd", DarkHeresyItemSheet, { makeDefault: true });
  Items.registerSheet("dark-heresy-2nd", DarkHeresyWeaponSheet, { types: ['weapon'], makeDefault: true });
  Items.registerSheet("dark-heresy-2nd", DarkHeresyArmourSheet, { types: ['armour'], makeDefault: true });
  Items.registerSheet("dark-heresy-2nd", DarkHeresyTalentSheet, { types: ['talent'], makeDefault: true });

  // Preload Handlebars templates.
  return initializeHandlebars();
});

Hooks.on("preCreateItem", (candidate, data, options, user) => {
  console.log('preCreateItem');
  console.log(candidate);
  console.log(data);
  console.log(options);
  console.log(user);
  return true;
});

/* -------------------------------------------- */
/*  Ready Hook                                  */
/* -------------------------------------------- */

Hooks.once("ready", async function() {
  // Wait to register hotbar drop hook on ready so that modules could register earlier if they want to
  Hooks.on("hotbarDrop", (bar, data, slot) => createItemMacro(data, slot));
});

/* -------------------------------------------- */
/*  Hotbar Macros                               */
/* -------------------------------------------- */

/**
 * Create a Macro from an Item drop.
 * Get an existing item macro if one exists, otherwise create a new one.
 * @param {Object} data     The dropped data
 * @param {number} slot     The hotbar slot to use
 * @returns {Promise}
 */
async function createItemMacro(data, slot) {
  if (data.type !== "Item") return;
  if (!("data" in data)) return ui.notifications.warn("You can only create macro buttons for owned Items");
  const item = data.data;

  // Create the macro command
  const command = `game.dark-heresy-2nd.rollItemMacro("${item.name}");`;
  let macro = game.macros.find(m => (m.name === item.name) && (m.command === command));
  if (!macro) {
    macro = await Macro.create({
      name: item.name,
      type: "script",
      img: item.img,
      command: command,
      flags: { "dark-heresy-2nd.itemMacro": true }
    });
  }
  game.user.assignHotbarMacro(macro, slot);
  return false;
}

/**
 * Create a Macro from an Item drop.
 * Get an existing item macro if one exists, otherwise create a new one.
 * @param {string} itemName
 * @return {Promise}
 */
function rollItemMacro(itemName) {
  const speaker = ChatMessage.getSpeaker();
  let actor;
  if (speaker.token) actor = game.actors.tokens[speaker.token];
  if (!actor) actor = game.actors.get(speaker.actor);
  const item = actor ? actor.items.find(i => i.name === itemName) : null;
  if (!item) return ui.notifications.warn(`Your controlled Actor does not have an item named ${itemName}`);

  // Trigger the item roll
  return item.roll();
}
