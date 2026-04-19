// Import data models

// Import dice/roll classes

// Import V2 Actor Sheets (ApplicationV2-based)

// Import V2 Item Sheets (ApplicationV2-based)

import { DHBasicActionManager } from './actions/basic-action-manager.ts';
import { DHCombatActionManager } from './actions/combat-action-manager.ts';
import { DHTargetedActionManager } from './actions/targeted-action-manager.ts';
import CharacterSheetSidebar from './applications/actor/character-sheet-sidebar.ts';
import {
    DarkHeresy1Sheet,
    DarkHeresy2Sheet,
    RogueTraderSheet,
    BlackCrusadeSheet,
    OnlyWarSheet,
    DeathwatchSheet,
    DarkHeresy1NPCSheet,
    DarkHeresy2NPCSheet,
    RogueTraderNPCSheet,
    BlackCrusadeNPCSheet,
    OnlyWarNPCSheet,
    DeathwatchNPCSheet,
} from './applications/actor/game-system-sheets.ts';
import NPCSheet from './applications/actor/npc-sheet.ts';
import StarshipSheet from './applications/actor/starship-sheet.ts';
import VehicleSheet from './applications/actor/vehicle-sheet.ts';
import * as characterCreation from './applications/character-creation/_module.ts';
import { RTCompendiumBrowser } from './applications/compendium-browser.ts';
import { TooltipsWH40K } from './applications/components/_module.ts';
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
} from './applications/item/_module.ts';
import * as npcApplications from './applications/npc/_module.ts';
import TokenRulerWH40K from './canvas/ruler.ts';
import { SYSTEM_ID } from './constants.ts';
import * as dataModels from './data/_module.ts';
import * as dice from './dice/_module.ts';
import * as documents from './documents/_module.ts';
import { WH40KActorProxy } from './documents/actor-proxy.ts';
import { WH40KItem } from './documents/item.ts';
import { HandlebarManager } from './handlebars/handlebars-manager.ts';
import {
    createCharacteristicMacro,
    createItemMacro,
    createSkillMacro,
    rollCharacteristicMacro,
    rollItemMacro,
    rollSkillMacro,
} from './macros/macro-manager.ts';
import { WH40K } from './rules/config.ts';
import { DHTourMain } from './tours/main-tour.ts';
import { TransactionManager } from './transactions/transaction-manager.ts';
import { RollTableUtils } from './utils/roll-table-utils.ts';
import { checkAndMigrateWorld } from './wh40k-rpg-migrations.ts';
import { WH40KSettings } from './wh40k-rpg-settings.ts';

export { SYSTEM_ID };

export class HooksManager {
    [key: string]: any;
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

        const CFG = CONFIG as any;
        const consolePrefix = 'WH40K RPG | ';
        (game as any).wh40k = {
            debug: false,
            log: (s: any, o?: any) => ((game as any).wh40k.debug ? console.log(`${consolePrefix}${s}`, o) : undefined),
            warn: (s: any, o?: any) => console.warn(`${consolePrefix}${s}`, o),
            error: (s: any, o?: any) => console.error(`${consolePrefix}${s}`, o),
            rollItemMacro,
            rollSkillMacro,
            rollCharacteristicMacro,
            // Roll table utilities
            rollTable: RollTableUtils,
            // Convenience methods for common roll tables
            rollPsychicPhenomena: (actor: any, mod: any) => RollTableUtils.rollPsychicPhenomena(actor, mod),
            rollPerilsOfTheWarp: (actor: any) => RollTableUtils.rollPerilsOfTheWarp(actor),
            rollFearEffects: (fear: any, dof: any) => RollTableUtils.rollFearEffects(fear, dof),
            rollMutation: () => RollTableUtils.rollMutation(),
            rollMalignancy: () => RollTableUtils.rollMalignancy(),
            showRollTableDialog: () => RollTableUtils.showRollTableDialog(),
            // Compendium browser
            openCompendiumBrowser: (options: any) => RTCompendiumBrowser.open(options),
            // Character creation
            OriginPathBuilder: characterCreation.OriginPathBuilder,
            openOriginPathBuilder: (actor: any, options?: Record<string, unknown>) => characterCreation.OriginPathBuilder.show(actor, options),
            // NPC utilities
            npc: npcApplications,
            applications: npcApplications, // Alias for shorter access
            ThreatCalculator: npcApplications.ThreatCalculator,
            quickCreateNPC: (config: any) => npcApplications.NPCQuickCreateDialog.create(config),
            batchCreateNPCs: (config: any) => npcApplications.BatchCreateDialog.open(config),
            openEncounterBuilder: () => npcApplications.EncounterBuilder.show(),
            exportStatBlock: (actor: any, format: any) => npcApplications.StatBlockExporter.quickExport(actor, format),
            importStatBlock: (input: any) => npcApplications.StatBlockParser.open(input),
            openTemplateSelector: (options: any) => npcApplications.TemplateSelector.open(options),
            // Phase 7: QoL Features
            DifficultyCalculatorDialog: npcApplications.DifficultyCalculatorDialog,
            calculateDifficulty: (actor: any) => npcApplications.DifficultyCalculatorDialog.show(actor),
            CombatPresetDialog: npcApplications.CombatPresetDialog,
            savePreset: (actor: any) => npcApplications.CombatPresetDialog.savePreset(actor),
            loadPreset: (actor: any) => npcApplications.CombatPresetDialog.loadPreset(actor),
            openPresetLibrary: () => npcApplications.CombatPresetDialog.showLibrary(),
            transaction: TransactionManager,
            // Dice/Roll classes
            dice: dice,
            BasicRollWH40K: dice.BasicRollWH40K,
            D100Roll: dice.D100Roll,
        };

        //CONFIG.debug.hooks = true;

        // Add custom constants for configuration.
        CFG.wh40k = WH40K;
        CFG.Combat.initiative = { formula: '@initiative.base + @initiative.bonus', decimals: 0 };
        CFG.MeasuredTemplate.defaults.angle = 30.0;

        // Define custom Document classes
        CFG.Actor.documentClass = WH40KActorProxy;
        // Per (system, kind) document class registrations. The generic proxy
        // dispatches to the right concrete class based on the actor's `type`.
        CFG.Actor.documentClasses = {
            'dh2-character': documents.WH40KDH2Character,
            'dh2-npc': documents.WH40KDH2NPC,
            'dh2-vehicle': documents.WH40KDH2Vehicle,
            'dh1-character': documents.WH40KDH1Character,
            'dh1-npc': documents.WH40KDH1NPC,
            'dh1-vehicle': documents.WH40KDH1Vehicle,
            'rt-character': documents.WH40KRTCharacter,
            'rt-npc': documents.WH40KRTNPC,
            'rt-vehicle': documents.WH40KRTVehicle,
            'rt-starship': documents.WH40KRTStarship,
            'bc-character': documents.WH40KBCCharacter,
            'bc-npc': documents.WH40KBCNPC,
            'bc-vehicle': documents.WH40KBCVehicle,
            'ow-character': documents.WH40KOWCharacter,
            'ow-npc': documents.WH40KOWNPC,
            'ow-vehicle': documents.WH40KOWVehicle,
            'dw-character': documents.WH40KDWCharacter,
            'dw-npc': documents.WH40KDWNPC,
            'dw-vehicle': documents.WH40KDWVehicle,
        };
        CFG.Item.documentClass = WH40KItem;
        CFG.ActiveEffect.documentClass = documents.WH40KActiveEffect;
        CFG.ChatMessage.documentClass = documents.ChatMessageWH40K;

        // Token document and movement
        CFG.Token.documentClass = documents.TokenDocumentWH40K;
        CFG.Token.rulerClass = TokenRulerWH40K;

        // Register custom Roll classes for serialization/deserialization
        CFG.Dice.rolls.push(dice.BasicRollWH40K, dice.D100Roll);

        // Register data models for actors — one per (system, kind) type.
        // DataModels handle schema validation and data preparation.
        CFG.Actor.dataModels = {
            'dh2-character': dataModels.DH2CharacterData,
            'dh2-npc': dataModels.DH2NPCData,
            'dh2-vehicle': dataModels.DH2VehicleData,
            'dh1-character': dataModels.DH1CharacterData,
            'dh1-npc': dataModels.DH1NPCData,
            'dh1-vehicle': dataModels.DH1VehicleData,
            'rt-character': dataModels.RTCharacterData,
            'rt-npc': dataModels.RTNPCData,
            'rt-vehicle': dataModels.RTVehicleData,
            'rt-starship': dataModels.RTStarshipData,
            'bc-character': dataModels.BCCharacterData,
            'bc-npc': dataModels.BCNPCData,
            'bc-vehicle': dataModels.BCVehicleData,
            'ow-character': dataModels.OWCharacterData,
            'ow-npc': dataModels.OWNPCData,
            'ow-vehicle': dataModels.OWVehicleData,
            'dw-character': dataModels.DWCharacterData,
            'dw-npc': dataModels.DWNPCData,
            'dw-vehicle': dataModels.DWVehicleData,
        };

        // Register Item data models
        // DataModels handle schema validation, migration, and data preparation
        CFG.Item.dataModels = {
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
            condition: dataModels.ConditionData,
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
        const DocumentSheetConfig = foundry.applications.apps.DocumentSheetConfig as any;

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
        // NPC sheet variants — one per game line, mirroring the PC variants
        // above. Dark Heresy 2e is default for this campaign; the other
        // systems are selectable per-actor via the Foundry sheet picker.
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, DarkHeresy2NPCSheet, {
            types: ['npc'],
            makeDefault: true,
            label: 'WH40K.Sheet.DarkHeresy2NPC',
        });
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, DarkHeresy1NPCSheet, {
            types: ['npc'],
            makeDefault: false,
            label: 'WH40K.Sheet.DarkHeresy1NPC',
        });
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, RogueTraderNPCSheet, {
            types: ['npc'],
            makeDefault: false,
            label: 'WH40K.Sheet.RogueTraderNPC',
        });
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, BlackCrusadeNPCSheet, {
            types: ['npc'],
            makeDefault: false,
            label: 'WH40K.Sheet.BlackCrusadeNPC',
        });
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, OnlyWarNPCSheet, {
            types: ['npc'],
            makeDefault: false,
            label: 'WH40K.Sheet.OnlyWarNPC',
        });
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, DeathwatchNPCSheet, {
            types: ['npc'],
            makeDefault: false,
            label: 'WH40K.Sheet.DeathwatchNPC',
        });
        // Keep the generic NPCSheet registered as a system-agnostic fallback
        // option (selectable via the sheet picker); not the default.
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, NPCSheet, {
            types: ['npc'],
            makeDefault: false,
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
        void HandlebarManager.loadTemplates();

        // Register movement actions and Token HUD hooks (after settings are available)
        documents.TokenDocumentWH40K.registerMovementActions();
        documents.TokenDocumentWH40K.registerHUDListeners();
        CFG.Token.movement.costAggregator = (results: any, distance: any, segment: any) => {
            return Math.max(...results.map((i: any) => i.cost));
        };
    }

    static async ready() {
        await checkAndMigrateWorld();

        // Initialize rich tooltip system
        (game as any).wh40k.tooltips = new TooltipsWH40K();
        await (game as any).wh40k.tooltips.initialize();
        TransactionManager.initialize();

        game.tours.register(SYSTEM_ID, 'main-tour', new DHTourMain());

        // @ts-expect-error - argument type
        if (!game.settings.get(SYSTEM_ID, WH40KSettings.SETTINGS.processActiveEffectsDuringCombat)) {
            DHCombatActionManager.disableHooks();
        }

        // One-time migration: rewrite any persisted sheetClass flag pointing at
        // the renamed NPCSheetV2 class so existing NPC actor sheets reopen cleanly.
        await HooksManager._migrateNPCSheetClassFlag();
    }

    /**
     * Rewrite `flags.core.sheetClass` for NPC actors that still reference the
     * old NPCSheetV2 identifier. Runs once per world startup; cheap enough
     * (only iterates actors whose flag actually points at the old class).
     */
    static async _migrateNPCSheetClassFlag() {
        const OLD_ID = `${SYSTEM_ID}.NPCSheetV2`;
        const NEW_ID = `${SYSTEM_ID}.NPCSheet`;
        const updates: Array<{ '_id': string; 'flags.core.sheetClass': string }> = [];
        for (const actor of (game as any).actors ?? []) {
            if (actor.type !== 'npc') continue;
            if (actor.getFlag?.('core', 'sheetClass') === OLD_ID) {
                updates.push({ '_id': actor.id, 'flags.core.sheetClass': NEW_ID });
            }
        }
        if (updates.length > 0) {
            await Actor.updateDocuments(updates);
            (game as any).wh40k?.log?.(`Migrated ${updates.length} NPC sheetClass flag(s) from NPCSheetV2 to NPCSheet.`);
        }
    }

    static hotbarDrop(bar, data, slot) {
        (game as any).wh40k.log('Hotbar Drop:', data);
        switch (data.type) {
            case 'characteristic':
                void createCharacteristicMacro(data, slot);
                return false;
            case 'item':
            case 'Item':
                void createItemMacro(data, slot);
                return false;
            case 'skill':
                void createSkillMacro(data, slot);
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
            // @ts-expect-error - dynamic property access
            const vehicleSheet = Object.values(sheetData).find((s) => s.id === 'wh40k-rpg.VehicleSheet');
            if (vehicleSheet) {
                // @ts-expect-error - dynamic property access
                return vehicleSheet.id;
            }
        }

        // Default to NPCSheet for standard NPCs
        return null; // Let default handling work
    }
}
