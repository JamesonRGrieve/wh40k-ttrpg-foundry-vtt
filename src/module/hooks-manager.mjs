import { RogueTraderItem } from './documents/item.mjs';
import { RogueTrader } from './rules/config.mjs';

// Import data models
import * as dataModels from './data/_module.mjs';

// Import V2 Actor Sheets (ApplicationV2-based)
import AcolyteSheet from './applications/actor/acolyte-sheet.mjs';
import AcolyteSheetSidebar from './applications/actor/acolyte-sheet-sidebar.mjs';
import NpcSheet from './applications/actor/npc-sheet.mjs';
import VehicleSheet from './applications/actor/vehicle-sheet.mjs';
import StarshipSheet from './applications/actor/starship-sheet.mjs';

// Import V2 Item Sheets (ApplicationV2-based)
import {
    BaseItemSheet,
    WeaponSheet,
    ArmourSheet,
    TalentSheet,
    TraitSheet,
    GearSheet,
    AmmoSheet,
    PsychicPowerSheet,
    SkillSheet,
    CyberneticSheet,
    ForceFieldSheet,
    CriticalInjurySheet,
    StorageLocationSheet,
    PeerEnemySheet,
    JournalEntryItemSheet,
    WeaponModSheet,
    AttackSpecialSheet
} from './applications/item/_module.mjs';

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
import { RogueTraderActorProxy } from './documents/actor-proxy.mjs';
import { RogueTraderSettings } from './rogue-trader-settings.mjs';
import { DHTargetedActionManager } from './actions/targeted-action-manager.mjs';
import { DHBasicActionManager } from './actions/basic-action-manager.mjs';
import { DHCombatActionManager } from './actions/combat-action-manager.mjs';
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
        CONFIG.ActiveEffect.documentClass = documents.RogueTraderActiveEffect;

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
        // V2 Sheets use DocumentSheetConfig API
        const DocumentSheetConfig = foundry.applications.apps.DocumentSheetConfig;

        // Unregister core V1 actor sheet and register V2 actor sheets
        DocumentSheetConfig.unregisterSheet(Actor, "core", foundry.appv1.sheets.ActorSheet);
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, AcolyteSheet, {
            types: ["acolyte", "character"],
            makeDefault: true,
            label: "RT.Sheet.Acolyte"
        });
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, AcolyteSheetSidebar, {
            types: ["acolyte", "character"],
            makeDefault: false,
            label: "RT.Sheet.AcolyteSidebar"
        });
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, NpcSheet, {
            types: ["npc"],
            makeDefault: true,
            label: "RT.Sheet.NPC"
        });
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, VehicleSheet, {
            types: ["vehicle"],
            makeDefault: true,
            label: "RT.Sheet.Vehicle"
        });
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, StarshipSheet, {
            types: ["starship"],
            makeDefault: true,
            label: "RT.Sheet.Starship"
        });

        // Unregister core V1 item sheet and register V2 item sheets
        DocumentSheetConfig.unregisterSheet(Item, "core", foundry.appv1.sheets.ItemSheet);
        
        // Default item sheet for unspecified types
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, BaseItemSheet, {
            makeDefault: true,
            label: "RT.Sheet.Item"
        });
        
        // Weapon sheet
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, WeaponSheet, {
            types: ["weapon"],
            makeDefault: true,
            label: "RT.Sheet.Weapon"
        });
        
        // Armour sheet
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, ArmourSheet, {
            types: ["armour"],
            makeDefault: true,
            label: "RT.Sheet.Armour"
        });
        
        // Talent sheet
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, TalentSheet, {
            types: ["talent"],
            makeDefault: true,
            label: "RT.Sheet.Talent"
        });
        
        // Trait sheet
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, TraitSheet, {
            types: ["trait"],
            makeDefault: true,
            label: "RT.Sheet.Trait"
        });
        
        // Gear sheet (consumables, drugs, tools, gear)
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, GearSheet, {
            types: ["gear", "consumable", "drug", "tool"],
            makeDefault: true,
            label: "RT.Sheet.Gear"
        });
        
        // Ammunition sheet
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, AmmoSheet, {
            types: ["ammunition"],
            makeDefault: true,
            label: "RT.Sheet.Ammunition"
        });
        
        // Psychic Power sheet
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, PsychicPowerSheet, {
            types: ["psychicPower"],
            makeDefault: true,
            label: "RT.Sheet.PsychicPower"
        });
        
        // Skill sheet
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, SkillSheet, {
            types: ["skill"],
            makeDefault: true,
            label: "RT.Sheet.Skill"
        });
        
        // Cybernetic sheet
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, CyberneticSheet, {
            types: ["cybernetic"],
            makeDefault: true,
            label: "RT.Sheet.Cybernetic"
        });
        
        // Force Field sheet
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, ForceFieldSheet, {
            types: ["forceField"],
            makeDefault: true,
            label: "RT.Sheet.ForceField"
        });
        
        // Critical Injury sheet
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, CriticalInjurySheet, {
            types: ["criticalInjury"],
            makeDefault: true,
            label: "RT.Sheet.CriticalInjury"
        });
        
        // Storage Location sheet
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, StorageLocationSheet, {
            types: ["storageLocation"],
            makeDefault: true,
            label: "RT.Sheet.StorageLocation"
        });
        
        // Peer/Enemy sheet
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, PeerEnemySheet, {
            types: ["peer", "enemy"],
            makeDefault: true,
            label: "RT.Sheet.PeerEnemy"
        });
        
        // Journal Entry sheet
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, JournalEntryItemSheet, {
            types: ["journalEntry"],
            makeDefault: true,
            label: "RT.Sheet.JournalEntry"
        });
        
        // Weapon Modification sheet
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, WeaponModSheet, {
            types: ["weaponModification"],
            makeDefault: true,
            label: "RT.Sheet.WeaponMod"
        });
        
        // Attack Special sheet
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, AttackSpecialSheet, {
            types: ["attackSpecial"],
            makeDefault: true,
            label: "RT.Sheet.AttackSpecial"
        });

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
