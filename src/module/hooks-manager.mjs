import { RogueTraderItem } from './documents/item.mjs';
import { RogueTrader } from './rules/config.mjs';
import { AcolyteSheet } from './sheets/actor/acolyte-sheet.mjs';
import { RogueTraderItemSheet } from './sheets/item/item-sheet.mjs';
import { RogueTraderWeaponSheet } from './sheets/item/weapon-sheet.mjs';
import { RogueTraderArmourSheet } from './sheets/item/armour-sheet.mjs';
import { RogueTraderTalentSheet } from './sheets/item/talent-sheet.mjs';
import { RogueTraderJournalEntrySheet } from './sheets/item/journal-entry-sheet.mjs';
import { RogueTraderPeerEnemySheet } from './sheets/item/peer-enemy-sheet.mjs';
import { RogueTraderAttackSpecialSheet } from './sheets/item/attack-special-sheet.mjs';
import { RogueTraderWeaponModSheet } from './sheets/item/weapon-mod-sheet.mjs';
import {
    createCharacteristicMacro,
    createItemMacro,
    createSkillMacro,
    rollCharacteristicMacro,
    rollItemMacro,
    rollSkillMacro,
} from './macros/macro-manager.mjs';
import { HandlebarManager } from './handlebars/handlebars-manager.mjs';
import { RogueTraderAmmoSheet } from './sheets/item/ammo-sheet.mjs';
import { RogueTraderPsychicPowerSheet } from './sheets/item/psychic-power-sheet.mjs';
import { RogueTraderStorageLocationSheet } from './sheets/item/storage-location-sheet.mjs';
import { RogueTraderTraitSheet } from './sheets/item/trait-sheet.mjs';
import { RogueTraderActorProxy } from './documents/actor-proxy.mjs';
import { NpcSheet } from './sheets/actor/npc-sheet.mjs';
import { VehicleSheet } from './sheets/actor/vehicle-sheet.mjs';
import { RogueTraderCriticalInjurySheet } from './sheets/item/critical-injury-sheet.mjs';
import { RogueTraderGearSheet } from './sheets/item/gear-sheet.mjs';
import { RogueTraderSettings } from './rogue-trader-settings.mjs';
import { DHTargetedActionManager } from './actions/targeted-action-manager.mjs';
import { DHBasicActionManager } from './actions/basic-action-manager.mjs';
import { DHCombatActionManager } from './actions/combat-action-manager.mjs';
import { RogueTraderCyberneticSheet } from './sheets/item/cybernetic-sheet.mjs';
import { RogueTraderForceFieldSheet } from './sheets/item/force-field-sheet.mjs';
import { checkAndMigrateWorld } from './rogue-trader-migrations.mjs';
import { DHTourMain } from './tours/main-tour.mjs';

import * as documents from './documents/_module.mjs'

export const SYSTEM_ID = 'rogue-trader';

export class HooksManager {
    static registerHooks() {
        console.log('Rogue Trader | Registering system hooks');

        Hooks.once('init', HooksManager.init);
        Hooks.on('ready', HooksManager.ready);
        Hooks.on('hotbarDrop', HooksManager.hotbarDrop);

        DHTargetedActionManager.initializeHooks();
        DHBasicActionManager.initializeHooks();
        DHCombatActionManager.initializeHooks();
    }

    static init() {
        console.log(`Loading Rogue Trader System
______________  _________ 
___  __ \__  / / /_|__  /
__  / / /_  /_/ /____/ /
_  /_/ /_  __  / _  __/ 
/_____/ /_/ /_/  /____/ 

"Only in death does duty end"
Enable Debug with: game.rt.debug = true           
`);

        const consolePrefix = 'Rogue Trader | ';
        game.rt = {
            debug: false,
            log: (s, o) => (!!game.rt.debug ? console.log(`${consolePrefix}${s}`, o) : undefined),
            warn: (s, o) => console.warn(`${consolePrefix}${s}`, o),
            error: (s, o) => console.error(`${consolePrefix}${s}`, o),
            rollItemMacro,
            rollSkillMacro,
            rollCharacteristicMacro,
        };

        //CONFIG.debug.hooks = true;

        // Add custom constants for configuration.
        CONFIG.rt = RogueTrader;
        CONFIG.Combat.initiative = { formula: '@initiative.base + @initiative.bonus', decimals: 0 };
        CONFIG.MeasuredTemplate.defaults.angle = 30.0;

        // Define custom Document classes
        CONFIG.Actor.documentClass = RogueTraderActorProxy;
        CONFIG.Actor.documentClasses = {
            acolyte: documents.RogueTraderAcolyte,
            character: documents.RogueTraderAcolyte,
            npc: documents.RogueTraderNPC,
            vehicle: documents.RogueTraderVehicle,
        };
        CONFIG.Item.documentClass = RogueTraderItem;

        // Register sheet application classes
        Actors.unregisterSheet('core', ActorSheet);
        Actors.registerSheet(SYSTEM_ID, AcolyteSheet, {types: ["acolyte", "character"], makeDefault: true });
        Actors.registerSheet(SYSTEM_ID, NpcSheet, {types: ['npc'], makeDefault: true });
        Actors.registerSheet(SYSTEM_ID, VehicleSheet, {types: ['vehicle'], makeDefault: true });

        Items.unregisterSheet('core', ItemSheet);
        Items.registerSheet(SYSTEM_ID, RogueTraderItemSheet, { makeDefault: true });
        Items.registerSheet(SYSTEM_ID, RogueTraderAmmoSheet, { types: ['ammunition'], makeDefault: true });
        Items.registerSheet(SYSTEM_ID, RogueTraderArmourSheet, { types: ['armour'], makeDefault: true });
        Items.registerSheet(SYSTEM_ID, RogueTraderAttackSpecialSheet, { types: ['attackSpecial'], makeDefault: true });
        Items.registerSheet(SYSTEM_ID, RogueTraderCriticalInjurySheet, { types: ['criticalInjury'], makeDefault: true });
        Items.registerSheet(SYSTEM_ID, RogueTraderCyberneticSheet, { types: ['cybernetic'], makeDefault: true });
        Items.registerSheet(SYSTEM_ID, RogueTraderJournalEntrySheet, { types: ['journalEntry'], makeDefault: true });
        Items.registerSheet(SYSTEM_ID, RogueTraderForceFieldSheet, { types: ['forceField'], makeDefault: true });
        Items.registerSheet(SYSTEM_ID, RogueTraderGearSheet, { types: ['consumable', 'gear', 'drug', 'tool'], makeDefault: true });
        Items.registerSheet(SYSTEM_ID, RogueTraderPeerEnemySheet, { types: ['peer', 'enemy'], makeDefault: true });
        Items.registerSheet(SYSTEM_ID, RogueTraderPsychicPowerSheet, { types: ['psychicPower'], makeDefault: true });
        Items.registerSheet(SYSTEM_ID, RogueTraderStorageLocationSheet, {types: ['storageLocation'],makeDefault: true,});
        Items.registerSheet(SYSTEM_ID, RogueTraderTalentSheet, { types: ['talent'], makeDefault: true });
        Items.registerSheet(SYSTEM_ID, RogueTraderTraitSheet, {types: ['trait'],makeDefault: true,});
        Items.registerSheet(SYSTEM_ID, RogueTraderWeaponModSheet, {types: ['weaponModification'],makeDefault: true,});
        Items.registerSheet(SYSTEM_ID, RogueTraderWeaponSheet, { types: ['weapon'], makeDefault: true });

        RogueTraderSettings.registerSettings();
        HandlebarManager.loadTemplates();
    }

    static async ready() {
        console.log(`Rogue Trader Loaded!`);
        await checkAndMigrateWorld();

        game.tours.register(SYSTEM_ID, "main-tour", new DHTourMain());

        console.log('Initializing with:', game.settings.get(SYSTEM_ID, RogueTraderSettings.SETTINGS.processActiveEffectsDuringCombat));
        if (!game.settings.get(SYSTEM_ID, RogueTraderSettings.SETTINGS.processActiveEffectsDuringCombat)) {
            DHCombatActionManager.disableHooks();
        }
    }

    static hotbarDrop(bar, data, slot) {
        game.rt.log('Hotbar Drop:', data);
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
