import { DarkHeresyActor } from './documents/actor.mjs';
import { DarkHeresyItem } from './documents/item.mjs';
import { DarkHeresy } from './helpers/config.mjs';
import { AcolyteSheet } from './sheets/acolyte-sheet.mjs';
import { DarkHeresyItemSheet } from './sheets/item-sheet.mjs';
import { DarkHeresyWeaponSheet } from './sheets/weapon-sheet.mjs';
import { DarkHeresyArmourSheet } from './sheets/armour-sheet.mjs';
import { DarkHeresyTalentSheet } from './sheets/talent-sheet.mjs';
import { DarkHeresyJournalEntrySheet } from './sheets/journal-entry-sheet.mjs';
import { DarkHeresyPeerEnemySheet } from './sheets/peer-enemy-sheet.mjs';
import { createCharacteristicMacro, createItemMacro, createSkillMacro, rollCharacteristicMacro, rollItemMacro, rollSkillMacro } from './rolls/macros.mjs';
import { HandlebarManager } from './handlebars.mjs';
import { DarkHeresyAmmoSheet } from './sheets/ammo-sheet.mjs';

export const MODULE_NAME = 'dh';

export class HooksManager {
  static registerHooks() {
    console.log('Dark Heresy 2nd Edition | Registering system hooks');

    Hooks.once('init', HooksManager.init);
    Hooks.on('ready', HooksManager.ready);
    Hooks.on('hotbarDrop', HooksManager.hotbarDrop);
  }

  static init() {
    console.log(`Loading Dark Heresy 2nd Edition System
______________  _______ 
___  __ \__  / / /_|__ \
__  / / /_  /_/ /____/ /
_  /_/ /_  __  / _  __/ 
/_____/ /_/ /_/  /____/ 
                        
`);

    game.dh = {
      dhActor: DarkHeresyActor,
      dhItem: DarkHeresyItem,
      rollItemMacro,
      rollSkillMacro,
      rollCharacteristicMacro,
    };

    // Add custom constants for configuration.
    CONFIG.dh = DarkHeresy;
    CONFIG.Combat.initiative = { formula: '@initiative.base + @initiative.bonus', decimals: 0 };

    // Define custom Document classes
    CONFIG.Actor.documentClass = DarkHeresyActor;
    CONFIG.Item.documentClass = DarkHeresyItem;

    // Register sheet application classes
    Actors.unregisterSheet('core', ActorSheet);
    Actors.registerSheet(MODULE_NAME, AcolyteSheet, { makeDefault: true });

    Items.unregisterSheet('core', ItemSheet);
    Items.registerSheet(MODULE_NAME, DarkHeresyItemSheet, { makeDefault: true });
    Items.registerSheet(MODULE_NAME, DarkHeresyWeaponSheet, { types: ['weapon'], makeDefault: true });
    Items.registerSheet(MODULE_NAME, DarkHeresyArmourSheet, { types: ['armour'], makeDefault: true });
    Items.registerSheet(MODULE_NAME, DarkHeresyTalentSheet, { types: ['talent'], makeDefault: true });
    Items.registerSheet(MODULE_NAME, DarkHeresyAmmoSheet, { types: ['ammunition'], makeDefault: true });
    Items.registerSheet(MODULE_NAME, DarkHeresyJournalEntrySheet, { types: ['journalEntry'], makeDefault: true });
    Items.registerSheet(MODULE_NAME, DarkHeresyPeerEnemySheet, { types: ['peer', 'enemy'], makeDefault: true });

    HandlebarManager.loadTemplates();
  }

  static async ready() {}

  static async hotbarDrop(bar, data, slot) {
    switch (data.type) {
      case 'Characteristic':
        await createCharacteristicMacro(data.data, slot);
        return false;
      case 'Item':
        await createItemMacro(data.data, slot);
        return false;
      case 'Skill':
        await createSkillMacro(data.data, slot);
        return false;
      default:
        return;
    }
  }
}
