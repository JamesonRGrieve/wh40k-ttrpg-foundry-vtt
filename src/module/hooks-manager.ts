import type { WH40KBaseActor } from './documents/base-actor.ts';
// Import data models

// Import dice/roll classes

// Import V2 Actor Sheets (ApplicationV2-based)

// Import V2 Item Sheets (ApplicationV2-based)

import { DHBasicActionManager } from './actions/basic-action-manager.ts';
import { DHCombatActionManager } from './actions/combat-action-manager.ts';
import { DHTargetedActionManager } from './actions/targeted-action-manager.ts';
import {
    // Player sheets (default for {system}-character)
    DarkHeresy1PlayerSheet,
    DarkHeresy2PlayerSheet,
    RogueTraderPlayerSheet,
    BlackCrusadePlayerSheet,
    OnlyWarPlayerSheet,
    DeathwatchPlayerSheet,
    ImperiumMaledictumPlayerSheet,
    // NPC sheets (default for {system}-npc)
    DarkHeresy1NPCSheet,
    DarkHeresy2NPCSheet,
    RogueTraderNPCSheet,
    BlackCrusadeNPCSheet,
    OnlyWarNPCSheet,
    DeathwatchNPCSheet,
    ImperiumMaledictumNPCSheet,
    // Vehicle sheets (default for {system}-vehicle)
    DarkHeresy1VehicleSheet,
    DarkHeresy2VehicleSheet,
    RogueTraderVehicleSheet,
    BlackCrusadeVehicleSheet,
    OnlyWarVehicleSheet,
    DeathwatchVehicleSheet,
    ImperiumMaledictumVehicleSheet,
    // Starship sheet (default for rt-starship)
    RogueTraderStarshipSheet,
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
    static registerHooks(): void {
        Hooks.once('init', () => HooksManager.init());
        Hooks.on('ready', () => HooksManager.ready());
        Hooks.on('hotbarDrop', (bar: Hotbar, data: Record<string, unknown>, slot: number) => HooksManager.hotbarDrop(bar, data, slot));
        Hooks.on('renderCompendiumDirectory', (app: CompendiumDirectory, html: JQuery, data: Record<string, unknown>) =>
            HooksManager.renderCompendiumDirectory(app, html, data),
        );
        Hooks.on('renderActorDirectory', (app: ActorDirectory, html: JQuery, data: Record<string, unknown>) =>
            HooksManager.renderActorDirectory(app, html, data),
        );
        Hooks.on('getActorSheetClass', (actor: Actor, sheetData: Record<string, { id: string; default?: boolean }>) =>
            HooksManager.getActorSheetClass(actor, sheetData),
        );

        DHTargetedActionManager.initializeHooks();
        DHBasicActionManager.initializeHooks();
        DHCombatActionManager.initializeHooks();
    }

    /**
     * Replace the default "Create Actor" behavior with the cascading
     * WH40KCreateActorDialog so users pick system + kind rather than a
     * flat type list.
     */
    static renderActorDirectory(_app: ActorDirectory, html: JQuery, _data: Record<string, unknown>) {
        const root = html[0];
        if (!root) return;
        const createBtn = root.querySelector(
            'button.create-document, a.create-document, button[data-action="createEntry"], button[data-action="createFolder"]',
        ) as HTMLElement | null;
        // The header "Create Actor" button — Foundry changes the selector
        // over versions, so match by visible text as a fallback.
        const headerButton =
            createBtn ?? (Array.from(root.querySelectorAll('button, a')).find((el) => /create\s+actor/i.test(el.textContent ?? '')) as HTMLElement | undefined);
        if (!headerButton) return;
        headerButton.addEventListener(
            'click',
            async (event) => {
                event.preventDefault();
                event.stopImmediatePropagation();
                const { WH40KCreateActorDialog } = await import('./applications/dialogs/create-actor-dialog.ts');
                await WH40KCreateActorDialog.open({});
            },
            true,
        ); // capture-phase so we beat Foundry's own handler
    }

    static init() {
        console.log('Loading WH40K RPG System v1.0.0');

        const consolePrefix = 'WH40K RPG | ';
        game.wh40k = {
            debug: false,
            log: (s: string, o?: unknown) => (game.wh40k.debug ? console.log(`${consolePrefix}${s}`, o) : undefined),
            warn: (s: string, o?: unknown) => console.warn(`${consolePrefix}${s}`, o),
            error: (s: string, o?: unknown) => console.error(`${consolePrefix}${s}`, o),
            rollItemMacro,
            rollSkillMacro,
            rollCharacteristicMacro,
            // Roll table utilities
            rollTable: RollTableUtils,
            // Convenience methods for common roll tables
            rollPsychicPhenomena: (actor: WH40KBaseActor, mod: unknown) => RollTableUtils.rollPsychicPhenomena(actor, mod),
            rollPerilsOfTheWarp: (actor: WH40KBaseActor) => RollTableUtils.rollPerilsOfTheWarp(actor),
            rollFearEffects: (fear: unknown, dof: unknown) => RollTableUtils.rollFearEffects(fear, dof),
            rollMutation: () => RollTableUtils.rollMutation(),
            rollMalignancy: () => RollTableUtils.rollMalignancy(),
            showRollTableDialog: () => RollTableUtils.showRollTableDialog(),
            // Compendium browser
            openCompendiumBrowser: (options: Record<string, unknown> = {}) => RTCompendiumBrowser.open(options),
            // Character creation
            OriginPathBuilder: characterCreation.OriginPathBuilder,
            openOriginPathBuilder: (actor: WH40KBaseActor, options: Record<string, unknown> = {}) => characterCreation.OriginPathBuilder.show(actor, options),
            // NPC utilities
            npc: npcApplications,
            ThreatCalculator: npcApplications.ThreatCalculator,
            quickCreateNPC: (config: unknown) => npcApplications.NPCQuickCreateDialog.create(config),
            batchCreateNPCs: (config: unknown) => npcApplications.BatchCreateDialog.open(config),
            openEncounterBuilder: () => npcApplications.EncounterBuilder.show(),
            exportStatBlock: (actor: WH40KBaseActor, format: unknown) => npcApplications.StatBlockExporter.quickExport(actor, format),
            importStatBlock: (input: unknown) => npcApplications.StatBlockParser.open(input),
            openTemplateSelector: (options: Record<string, unknown> = {}) => npcApplications.TemplateSelector.open(options),
            // Phase 7: QoL Features
            DifficultyCalculatorDialog: npcApplications.DifficultyCalculatorDialog,
            calculateDifficulty: (actor: WH40KBaseActor) => npcApplications.DifficultyCalculatorDialog.show(actor),
            CombatPresetDialog: npcApplications.CombatPresetDialog,
            savePreset: (actor: WH40KBaseActor) => npcApplications.CombatPresetDialog.savePreset(actor),
            loadPreset: (actor: WH40KBaseActor) => npcApplications.CombatPresetDialog.loadPreset(actor),
            openPresetLibrary: () => npcApplications.CombatPresetDialog.showLibrary(),
            transaction: TransactionManager,
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
        CONFIG.Actor.documentClass = WH40KActorProxy as unknown as typeof WH40KActorProxy;
        // Per (system, kind) document class registrations. The generic proxy
        // dispatches to the right concrete class based on the actor's `type`.
        CONFIG.Actor.documentClasses = {
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
            'im-character': documents.WH40KIMCharacter,
            'im-npc': documents.WH40KIMNPC,
            'im-vehicle': documents.WH40KIMVehicle,
            // Legacy-type fallbacks — kept so existing actors still load and
            // render until the ready-hook migration retypes them. Default to
            // DH2 concrete classes (this campaign's active system).
            'character': documents.WH40KDH2Character,
            'npc': documents.WH40KDH2NPC,
            'vehicle': documents.WH40KDH2Vehicle,
            'starship': documents.WH40KRTStarship,
        };
        CONFIG.Item.documentClass = WH40KItem;
        CONFIG.ActiveEffect.documentClass = documents.WH40KActiveEffect;
        CONFIG.ChatMessage.documentClass = documents.ChatMessageWH40K;

        // Token document and movement
        CONFIG.Token.documentClass = documents.TokenDocumentWH40K;
        CONFIG.Token.rulerClass = TokenRulerWH40K;

        // Register custom Roll classes for serialization/deserialization
        CONFIG.Dice.rolls.push(dice.BasicRollWH40K, dice.D100Roll);

        // Register data models for actors — one per (system, kind) type.
        // DataModels handle schema validation and data preparation.
        CONFIG.Actor.dataModels = {
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
            'im-character': dataModels.IMCharacterData,
            'im-npc': dataModels.IMNPCData,
            'im-vehicle': dataModels.IMVehicleData,
            // Legacy-type data-model fallbacks (same reasoning as above).
            'character': dataModels.DH2CharacterData,
            'npc': dataModels.DH2NPCData,
            'vehicle': dataModels.DH2VehicleData,
            'starship': dataModels.RTStarshipData,
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
            miscellaneous: dataModels.GearData,
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

        // Per-type sheet registration. Each of the 19 concrete actor types
        // gets exactly one default sheet — the factory-generated system
        // variant matching its system + kind. The sidebar/generic fallbacks
        // register against each of that kind's new types as selectable alt
        // options (makeDefault:false) so GMs can still switch if needed.
        const npcTypeIds = ['dh2-npc', 'dh1-npc', 'rt-npc', 'bc-npc', 'ow-npc', 'dw-npc', 'im-npc'];
        const vehicleTypeIds = ['dh2-vehicle', 'dh1-vehicle', 'rt-vehicle', 'bc-vehicle', 'ow-vehicle', 'dw-vehicle', 'im-vehicle'];
        const starshipTypeIds = ['rt-starship'];

        // --- Per-system default PC sheets ---
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, DarkHeresy2PlayerSheet, {
            types: ['dh2-character'],
            makeDefault: true,
            label: 'WH40K.Sheet.DarkHeresy2',
        });
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, DarkHeresy1PlayerSheet, {
            types: ['dh1-character'],
            makeDefault: true,
            label: 'WH40K.Sheet.DarkHeresy1',
        });
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, RogueTraderPlayerSheet, {
            types: ['rt-character'],
            makeDefault: true,
            label: 'WH40K.Sheet.RogueTrader',
        });
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, BlackCrusadePlayerSheet, {
            types: ['bc-character'],
            makeDefault: true,
            label: 'WH40K.Sheet.BlackCrusade',
        });
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, OnlyWarPlayerSheet, {
            types: ['ow-character'],
            makeDefault: true,
            label: 'WH40K.Sheet.OnlyWar',
        });
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, DeathwatchPlayerSheet, {
            types: ['dw-character'],
            makeDefault: true,
            label: 'WH40K.Sheet.Deathwatch',
        });
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, ImperiumMaledictumPlayerSheet, {
            types: ['im-character'],
            makeDefault: true,
            label: 'WH40K.Sheet.ImperiumMaledictum',
        });

        // --- Per-system default NPC sheets ---
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, DarkHeresy2NPCSheet, {
            types: ['dh2-npc'],
            makeDefault: true,
            label: 'WH40K.Sheet.DarkHeresy2NPC',
        });
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, DarkHeresy1NPCSheet, {
            types: ['dh1-npc'],
            makeDefault: true,
            label: 'WH40K.Sheet.DarkHeresy1NPC',
        });
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, RogueTraderNPCSheet, {
            types: ['rt-npc'],
            makeDefault: true,
            label: 'WH40K.Sheet.RogueTraderNPC',
        });
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, BlackCrusadeNPCSheet, {
            types: ['bc-npc'],
            makeDefault: true,
            label: 'WH40K.Sheet.BlackCrusadeNPC',
        });
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, OnlyWarNPCSheet, {
            types: ['ow-npc'],
            makeDefault: true,
            label: 'WH40K.Sheet.OnlyWarNPC',
        });
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, DeathwatchNPCSheet, {
            types: ['dw-npc'],
            makeDefault: true,
            label: 'WH40K.Sheet.DeathwatchNPC',
        });
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, ImperiumMaledictumNPCSheet, {
            types: ['im-npc'],
            makeDefault: true,
            label: 'WH40K.Sheet.ImperiumMaledictumNPC',
        });
        // Generic NPCSheet — selectable fallback on all NPC types.
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, NPCSheet, {
            types: npcTypeIds,
            makeDefault: false,
            label: 'WH40K.Sheet.NPC',
        });

        // --- Per-system default Vehicle sheets ---
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, DarkHeresy2VehicleSheet, {
            types: ['dh2-vehicle'],
            makeDefault: true,
            label: 'WH40K.Sheet.DarkHeresy2Vehicle',
        });
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, DarkHeresy1VehicleSheet, {
            types: ['dh1-vehicle'],
            makeDefault: true,
            label: 'WH40K.Sheet.DarkHeresy1Vehicle',
        });
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, RogueTraderVehicleSheet, {
            types: ['rt-vehicle'],
            makeDefault: true,
            label: 'WH40K.Sheet.RogueTraderVehicle',
        });
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, BlackCrusadeVehicleSheet, {
            types: ['bc-vehicle'],
            makeDefault: true,
            label: 'WH40K.Sheet.BlackCrusadeVehicle',
        });
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, OnlyWarVehicleSheet, {
            types: ['ow-vehicle'],
            makeDefault: true,
            label: 'WH40K.Sheet.OnlyWarVehicle',
        });
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, DeathwatchVehicleSheet, {
            types: ['dw-vehicle'],
            makeDefault: true,
            label: 'WH40K.Sheet.DeathwatchVehicle',
        });
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, ImperiumMaledictumVehicleSheet, {
            types: ['im-vehicle'],
            makeDefault: true,
            label: 'WH40K.Sheet.ImperiumMaledictumVehicle',
        });
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, VehicleSheet, {
            types: vehicleTypeIds,
            makeDefault: false,
            label: 'WH40K.Sheet.Vehicle',
        });

        // --- Starship (RT only for now) ---
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, RogueTraderStarshipSheet, {
            types: ['rt-starship'],
            makeDefault: true,
            label: 'WH40K.Sheet.RogueTraderStarship',
        });
        DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, StarshipSheet, {
            types: starshipTypeIds,
            makeDefault: false,
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

        // Gear sheet (consumables, drugs, tools, gear, miscellaneous quest items)
        DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, GearSheet, {
            types: ['gear', 'consumable', 'drug', 'tool', 'miscellaneous'],
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
        CONFIG.Token.movement.costAggregator = (results: unknown[], _distance: unknown, _segment: unknown) => {
            return Math.max(...results.map((i: { cost: number }) => i.cost));
        };
    }

    static async ready() {
        await checkAndMigrateWorld();

        // Initialize rich tooltip system
        game.wh40k.tooltips = new TooltipsWH40K();
        await game.wh40k.tooltips.initialize();
        TransactionManager.initialize();

        game.tours.register(SYSTEM_ID, 'main-tour', new DHTourMain());

        if (!game.settings.get(SYSTEM_ID, WH40KSettings.SETTINGS.processActiveEffectsDuringCombat)) {
            DHCombatActionManager.disableHooks();
        }
    }

    static hotbarDrop(_bar: unknown, data: Record<string, unknown>, slot: number): boolean | void {
        game.wh40k.log('Hotbar Drop:', data);
        switch (data.type) {
            case 'characteristic':
                void rollCharacteristicMacro(data, slot);
                return false;
            case 'item':
            case 'Item':
                void rollItemMacro(data, slot);
                return false;
            case 'skill':
                void rollSkillMacro(data, slot);
                return false;
            default:
                return true;
        }
    }

    static renderCompendiumDirectory(_app: CompendiumDirectory, html: JQuery, _data: Record<string, unknown>): void {
        const root = html?.[0] ?? (html as unknown as HTMLElement) ?? null;
        if (!root || typeof (root as HTMLElement).querySelector !== 'function') return;
        const header = root.querySelector('.directory-header');
        if (!header) return;

        if (header.querySelector('.wh40k-compendium-browser-btn')) return;

        const browserBtn = document.createElement('button');
        browserBtn.type = 'button';
        browserBtn.className = 'wh40k-compendium-browser-btn';
        browserBtn.title = 'Open Compendium Browser';
        browserBtn.innerHTML = '<i class="fas fa-search"></i> Compendium Browser';

        browserBtn.addEventListener('click', (event) => {
            event.preventDefault();
            void RTCompendiumBrowser.open();
        });

        const actions = header.querySelector('.header-actions');
        if (actions) actions.prepend(browserBtn);
    }

    /**
     * Auto-select appropriate sheet for npcV2 actors based on primaryUse field.
     * Hook: getActorSheetClass
     */
    static getActorSheetClass(actor: Actor, sheetData: Record<string, { id: string; default?: boolean }>): string | null {
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

        // Default to NPCSheet for standard NPCs
        return null; // Let default handling work
    }
}
