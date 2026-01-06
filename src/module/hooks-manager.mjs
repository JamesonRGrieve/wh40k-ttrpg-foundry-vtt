import { RogueTraderItem } from './documents/item.mjs';
import { RogueTrader } from './rules/config.mjs';

// Import data models
import * as dataModels from './data/_module.mjs';

import { AcolyteSheet } from './sheets/actor/acolyte-sheet.mjs';
import { RogueTraderItemSheet } from './sheets/item/item-sheet.mjs';
import { RogueTraderWeaponSheet } from './sheets/item/weapon-sheet.mjs';
import { RogueTraderArmourSheet } from './sheets/item/armour-sheet.mjs';
import { RogueTraderTalentSheet } from './sheets/item/talent-sheet.mjs';
import { RogueTraderJournalEntrySheet } from './sheets/item/journal-entry-sheet.mjs';
import { RogueTraderPeerEnemySheet } from './sheets/item/peer-enemy-sheet.mjs';
import { RogueTraderAttackSpecialSheet } from './sheets/item/attack-special-sheet.mjs';
import { RogueTraderWeaponModSheet } from './sheets/item/weapon-mod-sheet.mjs';
import { RTCompendiumBrowser } from './applications/compendium-browser.mjs';
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
import { RogueTraderSkillSheet } from './sheets/item/skill-sheet.mjs';
import { RogueTraderActorProxy } from './documents/actor-proxy.mjs';
import { NpcSheet } from './sheets/actor/npc-sheet.mjs';
import { VehicleSheet } from './sheets/actor/vehicle-sheet.mjs';
import { StarshipSheet } from './sheets/actor/starship-sheet.mjs';
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
import { RollTableUtils } from './utils/roll-table-utils.mjs';

import * as documents from './documents/_module.mjs'

export const SYSTEM_ID = 'rogue-trader';

export class HooksManager {
    static registerHooks() {

        Hooks.once('init', HooksManager.init);
        Hooks.on('ready', HooksManager.ready);
        Hooks.on('hotbarDrop', HooksManager.hotbarDrop);
        Hooks.on('renderCompendiumDirectory', HooksManager.renderCompendiumDirectory);

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
            // Roll table utilities
            rollTable: RollTableUtils,
            // Convenience methods for common roll tables
            rollPsychicPhenomena: (actor, mod) => RollTableUtils.rollPsychicPhenomena(actor, mod),
            rollPerilsOfTheWarp: (actor) => RollTableUtils.rollPerilsOfTheWarp(actor),
            rollFearEffects: (fear, dof) => RollTableUtils.rollFearEffects(fear, dof),
            rollMutation: () => RollTableUtils.rollMutation(),
            rollMalignancy: () => RollTableUtils.rollMalignancy(),
            showRollTableDialog: () => RollTableUtils.showRollTableDialog(),
            // Compendium browser
            openCompendiumBrowser: (options) => RTCompendiumBrowser.open(options),
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
            starship: documents.RogueTraderStarship,
        };
        CONFIG.Item.documentClass = RogueTraderItem;

        // Register data models for actors
        // DataModels handle schema validation and data preparation
        CONFIG.Actor.dataModels = {
            acolyte: dataModels.CharacterData,
            character: dataModels.CharacterData,
            npc: dataModels.NPCData,
            vehicle: dataModels.VehicleData,
            starship: dataModels.StarshipData,
        };

        // Register Item data models
        // DataModels handle schema validation, migration, and data preparation
        CONFIG.Item.dataModels = {
            // Equipment
            weapon: dataModels.WeaponData,
            armour: dataModels.ArmourData,
            ammunition: dataModels.AmmunitionData,
            gear: dataModels.GearData,
            consumable: dataModels.GearData,
            tool: dataModels.GearData,
            drug: dataModels.GearData,
            cybernetic: dataModels.CyberneticData,
            forceField: dataModels.ForceFieldData,
            backpack: dataModels.BackpackData,
            storageLocation: dataModels.StorageLocationData,
            // Character Features
            talent: dataModels.TalentData,
            trait: dataModels.TraitData,
            skill: dataModels.SkillData,
            originPath: dataModels.OriginPathData,
            aptitude: dataModels.AptitudeData,
            peer: dataModels.PeerEnemyData,
            enemy: dataModels.PeerEnemyData,
            // Powers
            psychicPower: dataModels.PsychicPowerData,
            navigatorPower: dataModels.NavigatorPowerData,
            ritual: dataModels.RitualData,
            // Ship & Vehicle
            shipComponent: dataModels.ShipComponentData,
            shipWeapon: dataModels.ShipWeaponData,
            shipUpgrade: dataModels.ShipUpgradeData,
            shipRole: dataModels.ShipRoleData,
            order: dataModels.OrderData,
            vehicleTrait: dataModels.VehicleTraitData,
            vehicleUpgrade: dataModels.VehicleUpgradeData,
            // Modifications & Qualities
            weaponModification: dataModels.WeaponModificationData,
            armourModification: dataModels.ArmourModificationData,
            weaponQuality: dataModels.WeaponQualityData,
            attackSpecial: dataModels.AttackSpecialData,
            // Misc
            specialAbility: dataModels.SpecialAbilityData,
            criticalInjury: dataModels.CriticalInjuryData,
            mutation: dataModels.MutationData,
            malignancy: dataModels.MalignancyData,
            mentalDisorder: dataModels.MentalDisorderData,
            journalEntry: dataModels.JournalEntryItemData,
        };

        // Register sheet application classes
        const ActorCollection = foundry.documents.collections.Actors;
        const ItemCollection = foundry.documents.collections.Items;
        const BaseActorSheet = foundry.appv1.sheets.ActorSheet;
        const BaseItemSheet = foundry.appv1.sheets.ItemSheet;

        ActorCollection.unregisterSheet('core', BaseActorSheet);
        ActorCollection.registerSheet(SYSTEM_ID, AcolyteSheet, {types: ["acolyte", "character"], makeDefault: true });
        ActorCollection.registerSheet(SYSTEM_ID, NpcSheet, {types: ['npc'], makeDefault: true });
        ActorCollection.registerSheet(SYSTEM_ID, VehicleSheet, {types: ['vehicle'], makeDefault: true });
        ActorCollection.registerSheet(SYSTEM_ID, StarshipSheet, {types: ['starship'], makeDefault: true });

        ItemCollection.unregisterSheet('core', BaseItemSheet);
        ItemCollection.registerSheet(SYSTEM_ID, RogueTraderItemSheet, { makeDefault: true });
        ItemCollection.registerSheet(SYSTEM_ID, RogueTraderAmmoSheet, { types: ['ammunition'], makeDefault: true });
        ItemCollection.registerSheet(SYSTEM_ID, RogueTraderArmourSheet, { types: ['armour'], makeDefault: true });
        ItemCollection.registerSheet(SYSTEM_ID, RogueTraderAttackSpecialSheet, { types: ['attackSpecial'], makeDefault: true });
        ItemCollection.registerSheet(SYSTEM_ID, RogueTraderCriticalInjurySheet, { types: ['criticalInjury'], makeDefault: true });
        ItemCollection.registerSheet(SYSTEM_ID, RogueTraderCyberneticSheet, { types: ['cybernetic'], makeDefault: true });
        ItemCollection.registerSheet(SYSTEM_ID, RogueTraderJournalEntrySheet, { types: ['journalEntry'], makeDefault: true });
        ItemCollection.registerSheet(SYSTEM_ID, RogueTraderForceFieldSheet, { types: ['forceField'], makeDefault: true });
        ItemCollection.registerSheet(SYSTEM_ID, RogueTraderGearSheet, { types: ['consumable', 'gear', 'drug', 'tool'], makeDefault: true });
        ItemCollection.registerSheet(SYSTEM_ID, RogueTraderPeerEnemySheet, { types: ['peer', 'enemy'], makeDefault: true });
        ItemCollection.registerSheet(SYSTEM_ID, RogueTraderPsychicPowerSheet, { types: ['psychicPower'], makeDefault: true });
        ItemCollection.registerSheet(SYSTEM_ID, RogueTraderStorageLocationSheet, {types: ['storageLocation'],makeDefault: true,});
        ItemCollection.registerSheet(SYSTEM_ID, RogueTraderTalentSheet, { types: ['talent'], makeDefault: true });
        ItemCollection.registerSheet(SYSTEM_ID, RogueTraderTraitSheet, {types: ['trait'],makeDefault: true,});
        ItemCollection.registerSheet(SYSTEM_ID, RogueTraderSkillSheet, {types: ['skill'],makeDefault: true,});
        ItemCollection.registerSheet(SYSTEM_ID, RogueTraderWeaponModSheet, {types: ['weaponModification'],makeDefault: true,});
        ItemCollection.registerSheet(SYSTEM_ID, RogueTraderWeaponSheet, { types: ['weapon'], makeDefault: true });

        RogueTraderSettings.registerSettings();
        HandlebarManager.loadTemplates();
    }

    static async ready() {
        await checkAndMigrateWorld();

        game.tours.register(SYSTEM_ID, "main-tour", new DHTourMain());

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

    static renderCompendiumDirectory(app, html, data) {
        const $html = html instanceof HTMLElement ? $(html) : html;
        const header = $html.find('.directory-header');
        if (!header.length) return;

        if (header.find('.rt-compendium-browser-btn').length) return;

        const browserBtn = $(`
            <button type="button" class="rt-compendium-browser-btn" title="Open RT Compendium Browser">
                <i class="fas fa-search"></i> RT Browser
            </button>
        `);
        browserBtn.on('click', (event) => {
            event.preventDefault();
            RTCompendiumBrowser.open();
        });
        header.find('.header-actions').prepend(browserBtn);
    }
}
