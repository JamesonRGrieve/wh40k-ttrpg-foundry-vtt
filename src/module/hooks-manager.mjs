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
} from './macros/macro-manager.mjs';
import { HandlebarManager } from './handlebars/handlebars-manager.mjs';
import { DarkHeresyAmmoSheet } from './sheets/item/ammo-sheet.mjs';
import { initializeActorActions } from './actions/actions-manager.mjs';
import { DarkHeresyPsychicPowerSheet } from './sheets/item/psychic-power-sheet.mjs';
import { DarkHeresyStorageLocationSheet } from './sheets/item/storage-location-sheet.mjs';
import { DarkHeresyTraitSheet } from './sheets/item/trait-sheet.mjs';
import { DarkHeresyActorProxy } from './documents/actor-proxy.mjs';
import { DarkHeresyAcolyte } from './documents/acolyte.mjs';
import { NpcSheet } from './sheets/actor/npc-sheet.mjs';
import { VehicleSheet } from './sheets/actor/vehicle-sheet.mjs';
import { DarkHeresyCriticalInjurySheet } from './sheets/item/critical-injury-sheet.mjs';
import { DarkHeresyGearSheet } from './sheets/item/gear-sheet.mjs';
import { DarkHeresySettings } from './dark-heresy-settings.mjs';

export const SYSTEM_ID = 'dark-heresy-2nd';

export class HooksManager {
    static registerHooks() {
        console.log('Dark Heresy 2nd Edition | Registering system hooks');

        Hooks.once('init', HooksManager.init);
        Hooks.on('ready', HooksManager.ready);
        Hooks.on('hotbarDrop', HooksManager.hotbarDrop);
    }

    static init() {
        console.log(`Loading Dark Heresy 2nd Edition System
______________  _________ 
___  __ \__  / / /_|__  /
__  / / /_  /_/ /____/ /
_  /_/ /_  __  / _  __/ 
/_____/ /_/ /_/  /____/ 

"Only in death does duty end"
Enable Debug with: game.dh.debug = true           
`);

        const consolePrefix = 'Dark Heresy | ';
        game.dh = {
            debug: false,
            log: (s, o) => (!!game.dh.debug ? console.log(`${consolePrefix}${s}`, o) : undefined),
            warn: (s, o) => console.warn(`${consolePrefix}${s}`, o),
            error: (s, o) => console.error(`${consolePrefix}${s}`, o),
            rollItemMacro,
            rollSkillMacro,
            rollCharacteristicMacro,
        };

        // CONFIG.debug.hooks = true;

        // Add custom constants for configuration.
        CONFIG.dh = DarkHeresy;
        CONFIG.Combat.initiative = { formula: '@initiative.base + @initiative.bonus', decimals: 0 };

        // Define custom Document classes
        CONFIG.Actor.documentClass = DarkHeresyActorProxy;
        CONFIG.Item.documentClass = DarkHeresyItem;

        // Register sheet application classes
        Actors.unregisterSheet('core', ActorSheet);
        Actors.registerSheet(SYSTEM_ID, AcolyteSheet, { makeDefault: true });
        Actors.registerSheet(SYSTEM_ID, NpcSheet, {types: ['npc'], makeDefault: true });
        Actors.registerSheet(SYSTEM_ID, VehicleSheet, {types: ['vehicle'], makeDefault: true });

        Items.unregisterSheet('core', ItemSheet);
        Items.registerSheet(SYSTEM_ID, DarkHeresyItemSheet, { makeDefault: true });
        Items.registerSheet(SYSTEM_ID, DarkHeresyAmmoSheet, { types: ['ammunition'], makeDefault: true });
        Items.registerSheet(SYSTEM_ID, DarkHeresyArmourSheet, { types: ['armour'], makeDefault: true });
        Items.registerSheet(SYSTEM_ID, DarkHeresyAttackSpecialSheet, { types: ['attackSpecial'], makeDefault: true });
        Items.registerSheet(SYSTEM_ID, DarkHeresyCriticalInjurySheet, { types: ['criticalInjury'], makeDefault: true });
        Items.registerSheet(SYSTEM_ID, DarkHeresyJournalEntrySheet, { types: ['journalEntry'], makeDefault: true });
        Items.registerSheet(SYSTEM_ID, DarkHeresyGearSheet, { types: ['gear', 'drug', 'tool', 'forceField'], makeDefault: true });
        Items.registerSheet(SYSTEM_ID, DarkHeresyPeerEnemySheet, { types: ['peer', 'enemy'], makeDefault: true });
        Items.registerSheet(SYSTEM_ID, DarkHeresyPsychicPowerSheet, { types: ['psychicPower'], makeDefault: true });
        Items.registerSheet(SYSTEM_ID, DarkHeresyStorageLocationSheet, {types: ['storageLocation'],makeDefault: true,});
        Items.registerSheet(SYSTEM_ID, DarkHeresyTalentSheet, { types: ['talent'], makeDefault: true });
        Items.registerSheet(SYSTEM_ID, DarkHeresyTraitSheet, {types: ['trait'],makeDefault: true,});
        Items.registerSheet(SYSTEM_ID, DarkHeresyWeaponModSheet, {types: ['weaponModification'],makeDefault: true,});
        Items.registerSheet(SYSTEM_ID, DarkHeresyWeaponSheet, { types: ['weapon'], makeDefault: true });

        HandlebarManager.loadTemplates();
    }

    static async ready() {
        console.log(`DH2e Loaded!`);
        DarkHeresySettings.registerSettings();
        initializeActorActions();
    }

    static hotbarDrop(bar, data, slot) {
        game.dh.log('Hotbar Drop:', data);
        switch (data.type) {
            case 'characteristic':
                createCharacteristicMacro(data, slot);
                return false;
            case 'item':
            case 'Item':
                createItemMacro(data, slot);
                return false;
            case 'skill':
                createSkillMacro(data, slot);
                return false;
            default:
                return;
        }
    }
}
