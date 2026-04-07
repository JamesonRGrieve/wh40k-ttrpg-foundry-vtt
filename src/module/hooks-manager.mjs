import { WH40KItem } from './documents/item.mjs';
import { WH40K } from './rules/config.mjs';

// Import data models
import * as dataModels from './data/_module.mjs';

// Import dice/roll classes
import * as dice from './dice/_module.mjs';

// Import V2 Actor Sheets (ApplicationV2-based)
import CharacterSheetSidebar from './applications/actor/character-sheet-sidebar.mjs';
import DarkHeresy1Sheet from './applications/actor/dark-heresy-1-sheet.mjs';
import DarkHeresy2Sheet from './applications/actor/dark-heresy-2-sheet.mjs';
import RogueTraderSheet from './applications/actor/rogue-trader-sheet.mjs';
import BlackCrusadeSheet from './applications/actor/black-crusade-sheet.mjs';
import OnlyWarSheet from './applications/actor/only-war-sheet.mjs';
import DeathwatchSheet from './applications/actor/deathwatch-sheet.mjs';
import NPCSheetV2 from './applications/actor/npc-sheet-v2.mjs';
import VehicleSheet from './applications/actor/vehicle-sheet.mjs';
import StarshipSheet from './applications/actor/starship-sheet.mjs';

// Import V2 Item Sheets (ApplicationV2-based)
import {
    BaseItemSheet,
    WeaponSheet,
    ArmourSheet,
    ArmourModSheet,
    TalentSheet,
    TraitSheet,
    GearSheet,
    AmmoSheet,
    PsychicPowerSheet,
    SkillSheet,
    CyberneticSheet,
    ForceFieldSheet,
    CriticalInjurySheet,
    ConditionSheet,
    CombatActionSheet,
    StorageLocationSheet,
    PeerEnemySheet,
    JournalEntryItemSheet,
    OriginPathSheet,
    WeaponModSheet,
    WeaponQualitySheet,
    AttackSpecialSheet,
    ShipComponentSheet,
    ShipWeaponSheet,
    ShipUpgradeSheet,
    NPCTemplateSheet,
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
import { WH40KActorProxy } from './documents/actor-proxy.mjs';
import { WH40KSettings } from './wh40k-rpg-settings.mjs';
import { DHTargetedActionManager } from './actions/targeted-action-manager.mjs';
import { DHBasicActionManager } from './actions/basic-action-manager.mjs';
import { DHCombatActionManager } from './actions/combat-action-manager.mjs';
import { checkAndMigrateWorld } from './wh40k-rpg-migrations.mjs';
import { DHTourMain } from './tours/main-tour.mjs';
import { RollTableUtils } from './utils/roll-table-utils.mjs';
import { TooltipsWH40K } from './applications/components/_module.mjs';
import * as characterCreation from './applications/character-creation/_module.mjs';
import * as npcApplications from './applications/npc/_module.mjs';

import * as documents from './documents/_module.mjs';
import TokenRulerWH40K from './canvas/ruler.mjs';
import { SYSTEM_ID } from './constants.mjs';

export { SYSTEM_ID };

export class HooksManager {
    static registerHooks() {
        Hooks.once('init', HooksManager.init);
        Hooks.on('ready', HooksManager.ready);
        Hooks.on('hotbarDrop', HooksManager.hotbarDrop);
        Hooks.on('renderCompendiumDirectory', HooksManager.renderCompendiumDirectory);
        Hooks.on('getActorSheetClass', HooksManager.getActorSheetClass);

        DHTargetedActionManager.initializeHooks();
        DHBasicActionManager.initializeHooks();
        DHCombatActionManager.initializeHooks();
    }

    static init() {
        console.log('Loading WH40K RPG System v1.0.0');

        const consolePrefix = 'WH40K RPG | ';
        game.wh40k = {
            debug: false,
            log: (s, o) => (game.wh40k.debug ? console.log(`${consolePrefix}${s}`, o) : undefined),
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
            // Character creation
            OriginPathBuilder: characterCreation.OriginPathBuilder,
            openOriginPathBuilder: (actor) => characterCreation.OriginPathBuilder.show(actor),
            // NPC utilities
            npc: npcApplications,
            applications: npcApplications, // Alias for shorter access
            ThreatCalculator: npcApplications.ThreatCalculator,
            quickCreateNPC: (config) => npcApplications.NPCQuickCreateDialog.create(config),
            batchCreateNPCs: (config) => npcApplications.BatchCreateDialog.open(config),
            openEncounterBuilder: () => npcApplications.EncounterBuilder.show(),
            exportStatBlock: (actor, format) => npcApplications.StatBlockExporter.quickExport(actor, format),
            importStatBlock: (input) => npcApplications.StatBlockParser.open(input),
            openTemplateSelector: (options) => npcApplications.TemplateSelector.open(options),
            // Phase 7: QoL Features
            DifficultyCalculatorDialog: npcApplications.DifficultyCalculatorDialog,
            calculateDifficulty: (actor) => npcApplications.DifficultyCalculatorDialog.show(actor),
            CombatPresetDialog: npcApplications.CombatPresetDialog,
            savePreset: (actor) => npcApplications.CombatPresetDialog.savePreset(actor),
            loadPreset: (actor) => npcApplications.CombatPresetDialog.loadPreset(actor),
            openPresetLibrary: () => npcApplications.CombatPresetDialog.showLibrary(),
            // Dice/Roll classes
            dice: dice,
            BasicRollWH40K: dice.BasicRollWH40K,
            D100Roll: dice.D100Roll,
        };

        //CONFIG.debug.hooks = true;

        // Add custom constants for configuration.
        CONFIG.wh40k = WH40K;
        CONFIG.Combat.initiative = { formula: '@initiative.base + @initiative.bonus', decimals: 0 };
        CONFIG.MeasuredTemplate.defaults.angle = 30.0;

        // Define custom Document classes
        CONFIG.Actor.documentClass = WH40KActorProxy;
        CONFIG.Actor.documentClasses = {
            character: documents.WH40KAcolyte,
            npc: documents.WH40KNPCV2,
            vehicle: documents.WH40KVehicle,
            starship: documents.WH40KStarship,
        };
        CONFIG.Item.documentClass = WH40KItem;
        CONFIG.ActiveEffect.documentClass = documents.WH40KActiveEffect;
        CONFIG.ChatMessage.documentClass = documents.ChatMessageWH40K;

        // Token document and movement
        CONFIG.Token.documentClass = documents.TokenDocumentWH40K;
        CONFIG.Token.rulerClass = TokenRulerWH40K;

        // Register custom Roll classes for serialization/deserialization
        CONFIG.Dice.rolls.push(dice.BasicRollWH40K, dice.D100Roll);

        // Register data models for actors
        // DataModels handle schema validation and data preparation
        CONFIG.Actor.dataModels = {
            character: dataModels.CharacterData,
            npc: dataModels.NPCDataV2,
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
            combatAction: dataModels.CombatActionData,
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
            // NPC Templates
            npcTemplate: dataModels.NPCTemplateData,
        };

        // Register sheet application classes
        // V2 Sheets use DocumentSheetConfig API
        const DocumentSheetConfig = foundry.applications.apps.DocumentSheetConfig;

        // Unregister core V1 actor sheet and register V2 actor sheets
        DocumentSheetConfig.unregisterSheet(Actor, 'core', foundry.appv1.sheets.ActorSheet);
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, DarkHeresy2Sheet, {
            types: ['character'],
            makeDefault: true,
            label: 'WH40K.Sheet.DarkHeresy2',
        });
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, DarkHeresy1Sheet, {
            types: ['character'],
            makeDefault: false,
            label: 'WH40K.Sheet.DarkHeresy1',
        });
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, RogueTraderSheet, {
            types: ['character'],
            makeDefault: false,
            label: 'WH40K.Sheet.RogueTrader',
        });
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, BlackCrusadeSheet, {
            types: ['character'],
            makeDefault: false,
            label: 'WH40K.Sheet.BlackCrusade',
        });
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, OnlyWarSheet, {
            types: ['character'],
            makeDefault: false,
            label: 'WH40K.Sheet.OnlyWar',
        });
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, DeathwatchSheet, {
            types: ['character'],
            makeDefault: false,
            label: 'WH40K.Sheet.Deathwatch',
        });
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, CharacterSheetSidebar, {
            types: ['character'],
            makeDefault: false,
            label: 'WH40K.Sheet.PlayerCharacterSidebar',
        });
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, NPCSheetV2, {
            types: ['npc'],
            makeDefault: true,
            label: 'WH40K.Sheet.NPC',
        });
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, VehicleSheet, {
            types: ['vehicle'],
            makeDefault: true,
            label: 'WH40K.Sheet.Vehicle',
        });
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, StarshipSheet, {
            types: ['starship'],
            makeDefault: true,
            label: 'WH40K.Sheet.Starship',
        });

        // Unregister core V1 item sheet and register V2 item sheets
        DocumentSheetConfig.unregisterSheet(Item, 'core', foundry.appv1.sheets.ItemSheet);

        // Default item sheet for unspecified types
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, BaseItemSheet, {
            makeDefault: true,
            label: 'WH40K.Sheet.Item',
        });

        // Weapon sheet
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, WeaponSheet, {
            types: ['weapon'],
            makeDefault: true,
            label: 'WH40K.Sheet.Weapon',
        });

        // Armour sheet
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, ArmourSheet, {
            types: ['armour'],
            makeDefault: true,
            label: 'WH40K.Sheet.Armour',
        });

        // Talent sheet
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, TalentSheet, {
            types: ['talent'],
            makeDefault: true,
            label: 'WH40K.Sheet.Talent',
        });

        // Trait sheet
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, TraitSheet, {
            types: ['trait'],
            makeDefault: true,
            label: 'WH40K.Sheet.Trait',
        });

        // Gear sheet (consumables, drugs, tools, gear)
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, GearSheet, {
            types: ['gear', 'consumable', 'drug', 'tool'],
            makeDefault: true,
            label: 'WH40K.Sheet.Gear',
        });

        // Ammunition sheet
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, AmmoSheet, {
            types: ['ammunition'],
            makeDefault: true,
            label: 'WH40K.Sheet.Ammunition',
        });

        // Psychic Power sheet
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, PsychicPowerSheet, {
            types: ['psychicPower'],
            makeDefault: true,
            label: 'WH40K.Sheet.PsychicPower',
        });

        // Skill sheet
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, SkillSheet, {
            types: ['skill'],
            makeDefault: true,
            label: 'WH40K.Sheet.Skill',
        });

        // Cybernetic sheet
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, CyberneticSheet, {
            types: ['cybernetic'],
            makeDefault: true,
            label: 'WH40K.Sheet.Cybernetic',
        });

        // Force Field sheet
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, ForceFieldSheet, {
            types: ['forceField'],
            makeDefault: true,
            label: 'WH40K.Sheet.ForceField',
        });

        // Critical Injury sheet
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, CriticalInjurySheet, {
            types: ['criticalInjury'],
            makeDefault: true,
            label: 'WH40K.Sheet.CriticalInjury',
        });

        // Condition sheet
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, ConditionSheet, {
            types: ['condition'],
            makeDefault: true,
            label: 'WH40K.Sheet.Condition',
        });

        // Combat Action sheet
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, CombatActionSheet, {
            types: ['combatAction'],
            makeDefault: true,
            label: 'WH40K.Sheet.CombatAction',
        });

        // Storage Location sheet
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, StorageLocationSheet, {
            types: ['storageLocation'],
            makeDefault: true,
            label: 'WH40K.Sheet.StorageLocation',
        });

        // Peer/Enemy sheet
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, PeerEnemySheet, {
            types: ['peer', 'enemy'],
            makeDefault: true,
            label: 'WH40K.Sheet.PeerEnemy',
        });

        // Journal Entry sheet
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, JournalEntryItemSheet, {
            types: ['journalEntry'],
            makeDefault: true,
            label: 'WH40K.Sheet.JournalEntry',
        });

        // Origin Path sheet
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, OriginPathSheet, {
            types: ['originPath'],
            makeDefault: true,
            label: 'WH40K.Sheet.OriginPath',
        });

        // Weapon Modification sheet
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, WeaponModSheet, {
            types: ['weaponModification'],
            makeDefault: true,
            label: 'WH40K.Sheet.WeaponMod',
        });

        // Armour Modification sheet
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, ArmourModSheet, {
            types: ['armourModification'],
            makeDefault: true,
            label: 'WH40K.Sheet.ArmourMod',
        });

        // Attack Special sheet
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, AttackSpecialSheet, {
            types: ['attackSpecial'],
            makeDefault: true,
            label: 'WH40K.Sheet.AttackSpecial',
        });

        // Weapon Quality sheet
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, WeaponQualitySheet, {
            types: ['weaponQuality'],
            makeDefault: true,
            label: 'WH40K.Sheet.WeaponQuality',
        });

        // Ship Component sheet
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, ShipComponentSheet, {
            types: ['shipComponent'],
            makeDefault: true,
            label: 'WH40K.Sheet.ShipComponent',
        });

        // Ship Weapon sheet
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, ShipWeaponSheet, {
            types: ['shipWeapon'],
            makeDefault: true,
            label: 'WH40K.Sheet.ShipWeapon',
        });

        // Ship Upgrade sheet
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, ShipUpgradeSheet, {
            types: ['shipUpgrade'],
            makeDefault: true,
            label: 'WH40K.Sheet.ShipUpgrade',
        });

        // NPC Template sheet
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, NPCTemplateSheet, {
            types: ['npcTemplate'],
            makeDefault: true,
            label: 'WH40K.Sheet.NPCTemplate',
        });

        WH40KSettings.registerSettings();
        HandlebarManager.loadTemplates();

        // Register movement actions and Token HUD hooks (after settings are available)
        documents.TokenDocumentWH40K.registerMovementActions();
        documents.TokenDocumentWH40K.registerHUDListeners();
        CONFIG.Token.movement.costAggregator = (results, distance, segment) => {
            return Math.max(...results.map((i) => i.cost));
        };
    }

    static async ready() {
        await checkAndMigrateWorld();

        // Initialize rich tooltip system
        game.wh40k.tooltips = new TooltipsWH40K();
        await game.wh40k.tooltips.initialize();

        game.tours.register(SYSTEM_ID, 'main-tour', new DHTourMain());

        if (!game.settings.get(SYSTEM_ID, WH40KSettings.SETTINGS.processActiveEffectsDuringCombat)) {
            DHCombatActionManager.disableHooks();
        }
    }

    static hotbarDrop(bar, data, slot) {
        game.wh40k.log('Hotbar Drop:', data);
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
                return true;
        }
    }

    static renderCompendiumDirectory(app, html, data) {
        const $html = html instanceof HTMLElement ? $(html) : html;
        const header = $html.find('.directory-header');
        if (!header.length) return;

        if (header.find('.wh40k-compendium-browser-btn').length) return;

        const browserBtn = $(`
            <button type="button" class="wh40k-compendium-browser-btn" title="Open Compendium Browser">
                <i class="fas fa-search"></i> Compendium Browser
            </button>
        `);
        browserBtn.on('click', (event) => {
            event.preventDefault();
            RTCompendiumBrowser.open();
        });
        header.find('.header-actions').prepend(browserBtn);
    }

    /**
     * Auto-select appropriate sheet for npcV2 actors based on primaryUse field.
     * Hook: getActorSheetClass
     */
    static getActorSheetClass(actor, sheetData) {
        // Only handle npcV2 actors
        if (actor.type !== 'npcV2') return null;

        // Check primaryUse field
        const primaryUse = actor.system?.primaryUse;

        // Auto-select vehicle sheet for vehicle/ship NPCs
        if (primaryUse === 'vehicle' || primaryUse === 'ship') {
            // Find VehicleSheet in registered sheets
            const vehicleSheet = Object.values(sheetData).find((s) => s.id === 'wh40k-rpg.VehicleSheet');
            if (vehicleSheet) {
                return vehicleSheet.id;
            }
        }

        // Default to NPCSheetV2 for standard NPCs
        return null; // Let default handling work
    }
}
