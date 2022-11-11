import { DarkHeresyActor } from './documents/actor.mjs';
import { DarkHeresyItem } from './documents/item.mjs';
import { DarkHeresy } from './rules/config.mjs';
import { AcolyteSheet } from './sheets/actor/acolyte-sheet.mjs';
import { DarkHeresyItemSheet } from './sheets/item/item-sheet.mjs';
import { DarkHeresyWeaponSheet } from './sheets/item/weapon-sheet.mjs';
import { DarkHeresyArmourSheet } from './sheets/item/armour-sheet.mjs';
import { DarkHeresyTalentSheet } from './sheets/item/talent-sheet.mjs';
import { DarkHeresyJournalEntrySheet } from './sheets/item/journal-entry-sheet.mjs';
import { DarkHeresyPeerEnemySheet } from './sheets/item/peer-enemy-sheet.mjs';
import { DarkHeresyAttackSpecialSheet } from './sheets/item/attack-special-sheet.mjs';
import { DarkHeresyWeaponModSheet } from './sheets/item/weapon-mod-sheet.mjs';
import {
    createCharacteristicMacro,
    createItemMacro,
    createSkillMacro,
    rollCharacteristicMacro,
    rollItemMacro,
    rollSkillMacro,
} from './rolls/macros.mjs';
import { HandlebarManager } from './handlebars/handlebars-manager.mjs';
import { DarkHeresyAmmoSheet } from './sheets/item/ammo-sheet.mjs';
import { initializeActorActions } from './actions/actions-manager.mjs';
import { DarkHeresyPsykanaSheet } from './sheets/item/psykana-sheet.mjs';

export const MODULE_NAME = 'dh';

export class HooksManager {
    static registerHooks() {
        console.log('Dark Heresy 2nd Edition | Registering system hooks');

        Hooks.once('init', HooksManager.init);
        Hooks.on('ready', HooksManager.ready);
        Hooks.on('hotbarDrop', HooksManager.hotbarDrop);
        initializeActorActions();
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

        // CONFIG.debug.hooks = true;

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
        Items.registerSheet(MODULE_NAME, DarkHeresyWeaponModSheet, {
            types: ['weaponModification'],
            makeDefault: true,
        });
        Items.registerSheet(MODULE_NAME, DarkHeresyArmourSheet, { types: ['armour'], makeDefault: true });
        Items.registerSheet(MODULE_NAME, DarkHeresyTalentSheet, { types: ['talent'], makeDefault: true });
        Items.registerSheet(MODULE_NAME, DarkHeresyAmmoSheet, { types: ['ammunition'], makeDefault: true });
        Items.registerSheet(MODULE_NAME, DarkHeresyJournalEntrySheet, { types: ['journalEntry'], makeDefault: true });
        Items.registerSheet(MODULE_NAME, DarkHeresyPeerEnemySheet, { types: ['peer', 'enemy'], makeDefault: true });
        Items.registerSheet(MODULE_NAME, DarkHeresyAttackSpecialSheet, { types: ['attackSpecial'], makeDefault: true });
        Items.registerSheet(MODULE_NAME, DarkHeresyPsykanaSheet, { types: ['psychicPower'], makeDefault: true });

        HandlebarManager.loadTemplates();
    }

    static async ready() {
        console.log(`DH2e Loaded!`);
    }

    static hotbarDrop(bar, data, slot) {
        console.log(data);
        switch (data.type) {
            case 'characteristic':
                createCharacteristicMacro(data.data, slot);
                return false;
            case 'item':
                createItemMacro(data.data, slot);
                return false;
            case 'skill':
                createSkillMacro(data.data, slot);
                return false;
            default:
                return;
        }
    }
}
