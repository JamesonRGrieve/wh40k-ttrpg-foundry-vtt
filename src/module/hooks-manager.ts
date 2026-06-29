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
    // Craft sheets (default for {system}-terracraft/aircraft/watercraft)
    DarkHeresy1CraftSheet,
    DarkHeresy2CraftSheet,
    RogueTraderCraftSheet,
    BlackCrusadeCraftSheet,
    OnlyWarCraftSheet,
    DeathwatchCraftSheet,
    ImperiumMaledictumCraftSheet,
    // Voidcraft sheet (default for rt-voidcraft)
    RogueTraderVoidcraftSheet,
} from './applications/actor/game-system-sheets.ts';
import LootActorSheet from './applications/actor/loot-sheet.ts';
import * as characterCreation from './applications/character-creation/_module.ts';
import { RTCompendiumBrowser } from './applications/compendium-browser.ts';
import { TooltipsWH40K } from './applications/components/_module.ts';
import { ConvertActorSystemDialog } from './applications/dialogs/convert-actor-system-dialog.ts';
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
    SpecialAbilitySheet,
    MalignancySheet,
    MutationSheet,
    MentalDisorderSheet,
    StorageLocationSheet,
    LocationSheet,
    PeerEnemySheet,
    JournalEntryItemSheet,
    EndeavourSheet,
    LeadSheet,
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
import { onRefreshToken } from './canvas/token-mask.ts';
import { hydrateActorInMemory } from './compendium-hydrate.ts';
import type { WH40KSystemConfig } from './config.ts';
import { SYSTEM_ID } from './constants.ts';
import * as dataModels from './data/_module.ts';
import { grantDefaultItemsToActor } from './default-grants.ts';
import * as dice from './dice/_module.ts';
import * as documents from './documents/_module.ts';
import { WH40KActorProxy } from './documents/actor-proxy.ts';
import type { WH40KBaseActor } from './documents/base-actor.ts';
import { WH40KItem } from './documents/item.ts';
import { HandlebarManager } from './handlebars/handlebars-manager.ts';
import { type FlaggableActor, isItemPilesPile, registerItemPilesValuation } from './integrations/item-piles.ts';
import {
    createCharacteristicMacro,
    createItemMacro,
    createSkillMacro,
    rollCharacteristicMacro,
    rollItemMacro,
    rollSkillMacro,
} from './macros/macro-manager.ts';
import { ItemDropManager } from './managers/item-drop-manager.ts';
import { reconcileWorldOriginGrants } from './origin-grant-reconcile.ts';
import { registerActionEconomy } from './rules/action-economy.ts';
import { WH40K } from './rules/config.ts';
import { registerMovementEnforcement } from './rules/movement-enforcement.ts';
import { buildWeaponQualityPayloadIndex } from './rules/weapon-quality-payloads.ts';
import { DHTourMain } from './tours/main-tour.ts';
import type { WH40KGameSystem } from './types/global.d.ts';
import { isConvertibleCharacterActorType } from './utils/actor-system-converter.ts';
import { backfillOriginPathUuids } from './utils/origin-path-uuid-backfill.ts';
import { RollTableUtils } from './utils/roll-table-utils.ts';
import { uuidNameCache } from './utils/uuid-name-cache.ts';
import { checkAndMigrateWorld } from './wh40k-rpg-migrations.ts';
import { WH40KSettings } from './wh40k-rpg-settings.ts';

interface DirectoryContextOption {
    name: string;
    icon: string;
    condition: (element: HTMLElement) => boolean;
    callback: (element: HTMLElement) => void | Promise<void>;
}

/** Minimal Token HUD shape needed by the loot pickup-button injection. */
interface LootTokenHUDLike {
    object?: {
        document?: { actor?: WH40KBaseActor | null };
    };
}

/** Minimal TokenDocument shape needed by the loot-move veto (preUpdateToken). */
interface LootMoveTokenLike {
    actor?: (FlaggableActor & { type?: string }) | null;
}

// biome-ignore lint/complexity/noStaticOnlyClass: stable system-bootstrap API surface with many callers
export class HooksManager {
    static registerHooks(): void {
        // Foundry's Hooks.on overloads in fvtt-types are tightly typed by hook name;
        // cast to a permissive shim so non-core hooks (system-emitted events) compile.
        /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-deprecated, no-restricted-syntax -- framework boundary: Hooks.on is deprecated in V14; hook payload typing varies by hook name; hooksOn shim return type must be unknown */
        // biome-ignore lint/suspicious/noExplicitAny: framework boundary — Foundry hook payloads are heterogeneous by hook name
        const hooksOn = Hooks.on.bind(Hooks) as (event: string, fn: (...args: any[]) => unknown) => number;
        /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-deprecated, no-restricted-syntax */
        Hooks.once('init', () => {
            HooksManager.init();
            registerItemPilesValuation();
        });
        hooksOn('ready', () => {
            void HooksManager.ready();
        });
        // eslint-disable-next-line no-restricted-syntax -- boundary: hotbarDrop hook payload is an untyped Record from Foundry
        hooksOn('hotbarDrop', (bar: unknown, data: Record<string, unknown>, slot: number) => HooksManager.hotbarDrop(bar, data, slot));
        /* eslint-disable no-restricted-syntax, @typescript-eslint/no-deprecated -- boundary: Foundry hook payloads use deprecated globals (CompendiumDirectory, ActorDirectory, Application); migration tracked separately */
        hooksOn('renderCompendiumDirectory', (app: CompendiumDirectory, html: JQuery, data: Record<string, unknown>) =>
            HooksManager.renderCompendiumDirectory(app, html, data),
        );
        hooksOn('renderActorDirectory', (app: ActorDirectory, html: JQuery, data: Record<string, unknown>) =>
            HooksManager.renderActorDirectory(app, html, data),
        );
        hooksOn('renderDocumentSheetConfig', (app: Application, html: JQuery, data: Record<string, unknown>) =>
            HooksManager.renderDocumentSheetConfig(app, html, data),
        );
        /* eslint-enable no-restricted-syntax, @typescript-eslint/no-deprecated */
        hooksOn('getActorDirectoryEntryContext', (_html: JQuery, options: DirectoryContextOption[]) => HooksManager.getActorDirectoryEntryContext(options));
        hooksOn('renderTokenHUD', (app: LootTokenHUDLike, html: HTMLElement | JQuery) => HooksManager.onLootTokenHUD(app, html));
        // Loot piles are dropped in place — non-GM players can't drag them around.
        hooksOn('preUpdateToken', (doc: LootMoveTokenLike, change: { x?: number; y?: number }) => HooksManager.onPreUpdateToken(doc, change));
        // Runtime circular busts from plain portraits (flags.wh40k-rpg.tokenFrame)
        hooksOn('refreshToken', (token: Parameters<typeof onRefreshToken>[0]) => onRefreshToken(token));
        hooksOn('getActorSheetClass', (actor: Actor, sheetData: Record<string, { id: string; default?: boolean }>) =>
            HooksManager.getActorSheetClass(actor, sheetData),
        );

        DHTargetedActionManager.initializeHooks();
        DHBasicActionManager.initializeHooks();
        DHCombatActionManager.initializeHooks();

        // Turn-gate + rate-limit token movement during combat (#235).
        registerMovementEnforcement();

        // Per-turn action-economy reset (Full/Half/Free/Reaction) during combat (#264).
        registerActionEconomy();

        // Keep the UUID → display-name cache warm as world docs change.
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry document hook payloads carry framework-typed loose shapes
        const onDocChange = (doc: { uuid?: string; name?: string }): void => {
            if (typeof doc.uuid === 'string' && typeof doc.name === 'string') {
                uuidNameCache.set(doc.uuid, doc.name);
            }
        };
        // eslint-disable-next-line no-restricted-syntax -- boundary: see above
        const onDocDelete = (doc: { uuid?: string }): void => {
            if (typeof doc.uuid === 'string') uuidNameCache.remove(doc.uuid);
        };
        for (const docType of ['Item', 'Actor', 'JournalEntry', 'RollTable'] as const) {
            hooksOn(`create${docType}`, onDocChange);
            hooksOn(`update${docType}`, onDocChange);
            hooksOn(`delete${docType}`, onDocDelete);
        }

        // Grant content-flagged default weapons (e.g. Unarmed) to every new
        // creature actor. Only the creating client performs the grant — gated on
        // the triggering userId — so concurrent clients don't stack duplicate copies.
        // eslint-disable-next-line no-restricted-syntax -- boundary: createActor hook payload is framework-typed; the grant surface is narrowed in default-grants.ts
        hooksOn('createActor', (actor: Parameters<typeof grantDefaultItemsToActor>[0], _options: unknown, userId: string) => {
            if (game.user.id !== userId) return;
            void grantDefaultItemsToActor(actor);
        });

        // Compendium actors ship LEAN inventories (compendiumSource / variantOf join
        // keys; see src/packs/CLAUDE.md). Join the canonical body IN MEMORY on import —
        // updateSource + reset, never a database write. NOT gated on the triggering
        // userId: every client must hydrate its own in-memory copy of the new actor
        // (unlike a DB write, which only one client should perform).
        // eslint-disable-next-line no-restricted-syntax -- boundary: createActor hook payload is framework-typed; narrowed inside compendium-hydrate.ts
        hooksOn('createActor', (actor: Parameters<typeof hydrateActorInMemory>[0]) => {
            // Fire-and-forget, but the rejection MUST be handled: an unhandled
            // rejection here surfaces as an uncaught page error during creation.
            // eslint-disable-next-line no-restricted-syntax -- boundary: a Promise rejection reason is untyped; it is logged, never propagated
            hydrateActorInMemory(actor).catch((err: unknown) => {
                console.error('compendium-hydrate: createActor hydration failed', err);
            });
        });

        // Per-encounter re-roll uses (talent/trait `reroll` variants with
        // frequency 'per-encounter') reset when the encounter Combat is deleted.
        // First active GM only — clearing the ledger writes a flag to the DB and
        // must run once. Per-session uses reset manually via
        // `actor.resetRerollUses('per-session')` (no native session-end hook).
        // eslint-disable-next-line no-restricted-syntax -- boundary: deleteCombat hook payload is framework-typed; we read only combatants → actor
        hooksOn('deleteCombat', (combat: { combatants?: { contents?: Array<{ actor?: WH40KBaseActor | null }> } }) => {
            const firstGM = game.users.contents.find((u) => u.active && u.isGM)?.id;
            if (game.user.id !== firstGM) return;
            const seen = new Set<string>();
            for (const combatant of combat.combatants?.contents ?? []) {
                const actor = combatant.actor;
                if (actor == null) continue;
                const id = actor.id;
                if (id === null || seen.has(id)) continue;
                seen.add(id);
                // eslint-disable-next-line no-restricted-syntax -- boundary: a Promise rejection reason is untyped; it is logged, never propagated
                actor.resetRerollUses('per-encounter').catch((err: unknown) => {
                    console.error('reroll-reset: deleteCombat per-encounter reset failed', err);
                });
            }
        });
    }

    /**
     * Replace the default "Create Actor" behavior with the cascading
     * WH40KCreateActorDialog so users pick system + kind rather than a
     * flat type list.
     */
    // eslint-disable-next-line @typescript-eslint/no-deprecated, no-restricted-syntax -- boundary: ActorDirectory is the V14 hook global; Record<string, unknown> is the Foundry hook payload type; migration tracked separately
    static renderActorDirectory(_app: ActorDirectory, html: JQuery, _data: Record<string, unknown>): void {
        const root = html[0] as HTMLElement | undefined;
        if (root === undefined) return;
        const createBtn = root.querySelector<HTMLElement>(
            'button.create-document, a.create-document, button[data-action="createEntry"], button[data-action="createFolder"]',
        );
        // The header "Create Actor" button — Foundry changes the selector
        // over versions, so match by visible text as a fallback.
        const headerButton: HTMLElement | undefined =
            createBtn ?? Array.from(root.querySelectorAll<HTMLElement>('button, a')).find((el) => /create\s+actor/i.test(String(el.textContent)));
        if (headerButton === undefined) return;
        headerButton.addEventListener(
            'click',
            (event) => {
                event.preventDefault();
                event.stopImmediatePropagation();
                void (async () => {
                    const { WH40KCreateActorDialog } = await import('./applications/dialogs/create-actor-dialog.ts');
                    await WH40KCreateActorDialog.open({});
                })();
            },
            true,
        ); // capture-phase so we beat Foundry's own handler
    }

    // eslint-disable-next-line @typescript-eslint/no-deprecated, no-restricted-syntax -- boundary: Application is the V14 hook global; Record<string, unknown> is the Foundry hook payload type; migration tracked separately
    static renderDocumentSheetConfig(app: Application, html: JQuery, _data: Record<string, unknown>): void {
        // eslint-disable-next-line @typescript-eslint/no-deprecated -- Application is the V14 global; migration tracked separately
        const document = (app as Application & { document?: Actor | Item }).document;
        if (document?.documentName !== 'Actor') return;

        const root = html[0] as HTMLElement | undefined;
        if (root === undefined) return;

        const sheetSelect = root.querySelector('select[name="sheetClass"]');
        if (!(sheetSelect instanceof HTMLSelectElement)) return;

        const defaultOptions = Array.from(sheetSelect.options).filter((option) => {
            const value = option.value.trim();
            const label = String(option.textContent).trim().toLowerCase();
            return value === '' || value === 'default' || label === 'default sheet';
        });

        for (const option of defaultOptions) {
            option.remove();
        }

        if (sheetSelect.options.length <= 1) {
            sheetSelect.disabled = true;
        }
    }

    static getActorDirectoryEntryContext(options: DirectoryContextOption[]): void {
        options.push({
            name: game.i18n.localize('WH40K.Actor.ConvertSystem.Menu'),
            icon: '<i class="fas fa-right-left"></i>',
            condition: (element: HTMLElement) => {
                const actor = HooksManager.getActorFromDirectoryEntry(element);
                return actor !== null && isConvertibleCharacterActorType(actor.type) && actor.isOwner;
            },
            callback: async (element: HTMLElement) => {
                const actor = HooksManager.getActorFromDirectoryEntry(element);
                if (!actor) return;
                await ConvertActorSystemDialog.open(actor);
            },
        });
    }

    static getActorFromDirectoryEntry(element: HTMLElement): WH40KBaseActor | null {
        const actorId =
            element.dataset['documentId'] ??
            element.dataset['entryId'] ??
            element.closest('[data-document-id], [data-entry-id]')?.getAttribute('data-document-id') ??
            element.closest('[data-document-id], [data-entry-id]')?.getAttribute('data-entry-id');
        if (actorId == null) return null;
        return (game.actors.get(actorId) as WH40KBaseActor | undefined) ?? null;
    }

    /**
     * Inject a "Pick Up" control into the Token HUD when the token is a loot
     * pile. Right-clicking any token opens its HUD; the loot Actor is created
     * with default OWNER ownership so every player can reach this control.
     * Pickup target resolution + transfer is shared with the loot sheet via
     * {@link ItemDropManager}.
     */
    static onLootTokenHUD(app: LootTokenHUDLike, html: HTMLElement | JQuery): void {
        const lootActor = app.object?.document?.actor ?? null;
        if (lootActor == null || (lootActor.type as string) !== 'loot') return;
        // Item Piles owns interaction for its own piles (double-click to open) —
        // don't add our pickup control on top, or it conflicts with theirs.
        if (isItemPilesPile(lootActor)) return;

        let root: HTMLElement | undefined;
        if (html instanceof HTMLElement) {
            root = html;
        } else {
            const first = html[0];
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess: jQuery[0] may be undefined under strict TS
            if (first === undefined) return;
            root = first;
        }
        if (root.querySelector('.wh40k-loot-pickup') !== null) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'wh40k-loot-pickup control-icon tw-flex tw-items-center tw-justify-center tw-gap-1 tw-cursor-pointer';
        btn.title = game.i18n.localize('WH40K.Loot.PickUp');
        btn.setAttribute('aria-label', game.i18n.localize('WH40K.Loot.PickUp'));
        btn.innerHTML = '<i class="fas fa-hand-holding"></i>';
        btn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            // eslint-disable-next-line no-restricted-syntax -- boundary: canvas.tokens is the Foundry token layer; only controlled actors are read
            const controlled = (canvas.tokens?.controlled ?? []) as Array<{ actor?: WH40KBaseActor | null }>;
            const userCharacter = (game.user.character as WH40KBaseActor | null | undefined) ?? null;
            const receiver = ItemDropManager.resolveReceivingActor<WH40KBaseActor>(controlled, userCharacter);
            if (receiver == null) {
                ui.notifications.warn(game.i18n.localize('WH40K.Warning.LootNoReceiver'));
                return;
            }
            void ItemDropManager.pickupLoot(receiver, lootActor);
        });

        const leftCol = root.querySelector('.col.left') ?? root.querySelector('.col.middle') ?? root;
        leftCol.appendChild(btn);
    }

    /**
     * Veto drag-moves of loot pile tokens by non-GM players. Loot is dropped in
     * place; players may select, inspect, and pick a pile up via the Token HUD
     * control, but may not reposition it. The decision lives in the pure
     * {@link ItemDropManager.blocksLootTokenMove} helper; returning false aborts
     * the position update.
     */
    static onPreUpdateToken(doc: LootMoveTokenLike, change: { x?: number; y?: number }): boolean {
        // Item Piles applies its own movement lock to its piles; defer to it.
        if (isItemPilesPile(doc.actor)) return true;
        const actorType = doc.actor?.type ?? null;
        if (ItemDropManager.blocksLootTokenMove(actorType, change, game.user.isGM)) {
            ui.notifications.warn(game.i18n.localize('WH40K.Warning.LootTokenLocked'));
            return false;
        }
        return true;
    }

    static init(): void {
        // eslint-disable-next-line no-console -- system bootstrap log before game.wh40k.log is defined
        console.log('Loading WH40K RPG System v1.0.0');

        const consolePrefix = 'WH40K RPG | ';
        game.wh40k = {
            debug: false,
            /* eslint-disable no-restricted-syntax, no-console -- boundary: game.wh40k system-global; console wrappers are the canonical logging interface; unknown params and as-unknown casts necessary for the polymorphic API */
            log: (s: string, o?: unknown) => (game.wh40k.debug ? console.log(`${consolePrefix}${s}`, o) : undefined),
            warn: (s: string, o?: unknown) => console.warn(`${consolePrefix}${s}`, o),
            error: (s: string, o?: unknown) => console.error(`${consolePrefix}${s}`, o),
            rollItemMacro: rollItemMacro as unknown as (data: Record<string, unknown>, slot: number) => Promise<unknown>,
            rollSkillMacro: rollSkillMacro as unknown as (data: Record<string, unknown>, slot: number) => Promise<unknown>,
            rollCharacteristicMacro: rollCharacteristicMacro as unknown as (data: Record<string, unknown>, slot: number) => Promise<unknown>,
            // Roll table utilities
            rollTable: RollTableUtils,
            // Convenience methods for common roll tables
            rollPsychicPhenomena: async (actor: WH40KBaseActor, mod: unknown) => RollTableUtils.rollPsychicPhenomena(actor, mod as number | undefined),
            rollPerilsOfTheWarp: async (actor: WH40KBaseActor) => RollTableUtils.rollPerilsOfTheWarp(actor),
            rollFearEffects: async (fear: unknown, dof: unknown) => RollTableUtils.rollFearEffects(fear as number | undefined, dof as number | undefined),
            rollMutation: async () => RollTableUtils.rollMutation(),
            rollMalignancy: async () => RollTableUtils.rollMalignancy(),
            showRollTableDialog: async () => Promise.resolve(RollTableUtils.showRollTableDialog()),
            // Compendium browser
            openCompendiumBrowser: async (options: Record<string, unknown> = {}) => Promise.resolve(RTCompendiumBrowser.open(options)),
            // Character creation
            OriginPathBuilder: characterCreation.OriginPathBuilder,
            openOriginPathBuilder: async (actor: WH40KBaseActor, options: Record<string, unknown> = {}) =>
                Promise.resolve(characterCreation.OriginPathBuilder.show(actor, options)),
            // NPC utilities
            npc: npcApplications,
            applications: npcApplications,
            ThreatCalculator: npcApplications.ThreatCalculator,
            quickCreateNPC: async (config: unknown) =>
                npcApplications.NPCQuickCreateDialog.create(config as Parameters<typeof npcApplications.NPCQuickCreateDialog.create>[0]),
            batchCreateNPCs: async (config: unknown) =>
                npcApplications.BatchCreateDialog.open(config as Parameters<typeof npcApplications.BatchCreateDialog.open>[0]),
            openEncounterBuilder: async () => Promise.resolve(npcApplications.EncounterBuilder.show()),
            exportStatBlock: async (actor: WH40KBaseActor, format: unknown) =>
                npcApplications.StatBlockExporter.quickExport(actor, format as 'text' | 'json' | undefined),
            importStatBlock: async (input: unknown) => npcApplications.StatBlockParser.open(input),
            openTemplateSelector: async (options: Record<string, unknown> = {}) => npcApplications.TemplateSelector.open(options),
            // Phase 7: QoL Features
            DifficultyCalculatorDialog: npcApplications.DifficultyCalculatorDialog,
            calculateDifficulty: async (actor: WH40KBaseActor) => Promise.resolve(npcApplications.DifficultyCalculatorDialog.show(actor as never)),
            CombatPresetDialog: npcApplications.CombatPresetDialog,
            savePreset: async (actor: WH40KBaseActor) => Promise.resolve(npcApplications.CombatPresetDialog.savePreset(actor as never)),
            loadPreset: async (actor: WH40KBaseActor) => Promise.resolve(npcApplications.CombatPresetDialog.loadPreset(actor as never)),
            openPresetLibrary: async () => Promise.resolve(npcApplications.CombatPresetDialog.showLibrary()),
            // Dice/Roll classes
            dice: dice,
            BasicRollWH40K: dice.BasicRollWH40K,
            D100Roll: dice.D100Roll,
            // tooltips is initialized in ready()
            tooltips: null as unknown as WH40KGameSystem['tooltips'],
        };
        /* eslint-enable no-restricted-syntax */

        //CONFIG.debug.hooks = true;

        // Add custom constants for configuration.
        // eslint-disable-next-line no-restricted-syntax -- boundary: WH40K config cast to internal system config type; no fvtt-types schema available
        CONFIG.wh40k = WH40K as unknown as WH40KSystemConfig;
        CONFIG.Combat.initiative = { formula: '@initiative.base + @initiative.bonus', decimals: 0 };
        CONFIG.MeasuredTemplate.defaults.angle = 30.0;

        // Define custom Document classes
        CONFIG.Actor.documentClass = WH40KActorProxy;
        // Per (system, kind) document class registrations. The generic proxy
        // dispatches to the right concrete class based on the actor's `type`.
        // eslint-disable-next-line no-restricted-syntax -- boundary: CONFIG.Actor documentClasses is a system extension not in fvtt-types
        (CONFIG.Actor as Record<string, unknown>)['documentClasses'] = {
            // #308: the per-(system,kind) concrete document subclasses were empty
            // (`extends <Kind>DocBase {}`); WH40KActorProxy dispatches by the `type`
            // string, so every key points straight at its kind-base. Keys + order are
            // preserved byte-for-byte (the legacy/generic fallbacks below are load-bearing).
            'dh2-character': documents.CharacterDocBase,
            'dh2-npc': documents.NPCDocBase,
            'dh2-terracraft': documents.VehicleDocBase,
            'dh2-aircraft': documents.VehicleDocBase,
            'dh1-character': documents.CharacterDocBase,
            'dh1-npc': documents.NPCDocBase,
            'dh1-terracraft': documents.VehicleDocBase,
            'rt-character': documents.CharacterDocBase,
            'rt-npc': documents.NPCDocBase,
            'rt-terracraft': documents.VehicleDocBase,
            'rt-aircraft': documents.VehicleDocBase,
            'rt-voidcraft': documents.VoidcraftDocBase,
            'bc-character': documents.CharacterDocBase,
            'bc-npc': documents.NPCDocBase,
            'bc-terracraft': documents.VehicleDocBase,
            'ow-character': documents.CharacterDocBase,
            'ow-npc': documents.NPCDocBase,
            'ow-terracraft': documents.VehicleDocBase,
            'ow-aircraft': documents.VehicleDocBase,
            'dw-character': documents.CharacterDocBase,
            'dw-npc': documents.NPCDocBase,
            'dw-terracraft': documents.VehicleDocBase,
            'dw-aircraft': documents.VehicleDocBase,
            'im-character': documents.CharacterDocBase,
            'im-npc': documents.NPCDocBase,
            'im-terracraft': documents.VehicleDocBase,
            // Legacy-type + generic fallbacks — kept so pre-craft-rename world
            // actors still load until the ready-hook migration retypes them.
            'character': documents.CharacterDocBase,
            'npc': documents.NPCDocBase,
            'dh2-vehicle': documents.VehicleDocBase,
            'dh1-vehicle': documents.VehicleDocBase,
            'rt-vehicle': documents.VehicleDocBase,
            'rt-starship': documents.VoidcraftDocBase,
            'bc-vehicle': documents.VehicleDocBase,
            'ow-vehicle': documents.VehicleDocBase,
            'dw-vehicle': documents.VehicleDocBase,
            'im-vehicle': documents.VehicleDocBase,
            'vehicle': documents.VehicleDocBase,
            'terracraft': documents.VehicleDocBase,
            'aircraft': documents.VehicleDocBase,
            'starship': documents.VoidcraftDocBase,
            'voidcraft': documents.VoidcraftDocBase,
            // Loot piles are minimal inventory actors with no kind-specific document
            // behaviour — map to the base (matches the proxy's unmapped-type fallback,
            // now explicit so the type is a registered concrete class like every other).
            'loot': documents.WH40KBaseActor,
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
            'dh2-terracraft': dataModels.DH2TerracraftData,
            'dh2-aircraft': dataModels.DH2AircraftData,
            'dh1-character': dataModels.DH1CharacterData,
            'dh1-npc': dataModels.DH1NPCData,
            'dh1-terracraft': dataModels.DH1TerracraftData,
            'rt-character': dataModels.RTCharacterData,
            'rt-npc': dataModels.RTNPCData,
            'rt-terracraft': dataModels.RTTerracraftData,
            'rt-aircraft': dataModels.RTAircraftData,
            'rt-voidcraft': dataModels.RTVoidcraftData,
            'bc-character': dataModels.BCCharacterData,
            'bc-npc': dataModels.BCNPCData,
            'bc-terracraft': dataModels.BCTerracraftData,
            'ow-character': dataModels.OWCharacterData,
            'ow-npc': dataModels.OWNPCData,
            'ow-terracraft': dataModels.OWTerracraftData,
            'ow-aircraft': dataModels.OWAircraftData,
            'dw-character': dataModels.DWCharacterData,
            'dw-npc': dataModels.DWNPCData,
            'dw-terracraft': dataModels.DWTerracraftData,
            'dw-aircraft': dataModels.DWAircraftData,
            'im-character': dataModels.IMCharacterData,
            'im-npc': dataModels.IMNPCData,
            'im-terracraft': dataModels.IMTerracraftData,
            // Legacy-type data-model fallbacks (same reasoning as documentClasses).
            'character': dataModels.DH2CharacterData,
            'npc': dataModels.DH2NPCData,
            'dh2-vehicle': dataModels.DH2TerracraftData,
            'dh1-vehicle': dataModels.DH1TerracraftData,
            'rt-vehicle': dataModels.RTTerracraftData,
            'rt-starship': dataModels.RTVoidcraftData,
            'bc-vehicle': dataModels.BCTerracraftData,
            'ow-vehicle': dataModels.OWTerracraftData,
            'dw-vehicle': dataModels.DWTerracraftData,
            'im-vehicle': dataModels.IMTerracraftData,
            'vehicle': dataModels.DH2TerracraftData,
            'terracraft': dataModels.TerracraftData,
            'aircraft': dataModels.AircraftData,
            'watercraft': dataModels.WatercraftData,
            'starship': dataModels.RTVoidcraftData,
            'voidcraft': dataModels.VoidcraftData,
            // Content-agnostic loot pile — one homologated type for all lines.
            // No concrete document class: the actor proxy falls back to
            // WH40KBaseActor, which is all a pile of embedded items needs.
            'loot': dataModels.LootData,
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
            location: dataModels.LocationData,
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
            endeavour: dataModels.EndeavourData,
            lead: dataModels.LeadData,
            // NPC Templates
            npcTemplate: dataModels.NPCTemplateData,
        };

        // Register sheet application classes
        // V2 Sheets use DocumentSheetConfig API
        const DocumentSheetConfig = foundry.applications.apps.DocumentSheetConfig;

        // Unregister both core actor sheet generations so "Default Sheet"
        // never appears alongside the system's type-bound sheets.
        DocumentSheetConfig.unregisterSheet(Actor, 'core', foundry.appv1.sheets.ActorSheet);
        // eslint-disable-next-line no-restricted-syntax -- boundary: foundry.applications.sheets is not fully typed; ActorSheetV2 may not exist in all V14 builds
        const actorSheetV2 = (foundry.applications.sheets as Record<string, unknown>)['ActorSheetV2'];
        if (actorSheetV2 !== undefined) {
            DocumentSheetConfig.unregisterSheet(Actor, 'core', actorSheetV2 as Parameters<typeof DocumentSheetConfig.unregisterSheet>[2]);
        }

        // Per-type sheet registration — table-driven (#308). Each concrete type
        // gets exactly one default sheet; the descriptor tables preserve the
        // original registration ORDER and the legacy-type aliases verbatim.
        // Sheet choice must not diverge from type.
        type SheetReg = { sheet: Parameters<typeof DocumentSheetConfig.registerSheet>[2]; types?: string[]; label: string };

        const ACTOR_SHEETS: SheetReg[] = [
            // Per-system default PC sheets
            { sheet: DarkHeresy2PlayerSheet, types: ['dh2-character'], label: 'WH40K.Sheet.DarkHeresy2' },
            { sheet: DarkHeresy1PlayerSheet, types: ['dh1-character'], label: 'WH40K.Sheet.DarkHeresy1' },
            { sheet: RogueTraderPlayerSheet, types: ['rt-character'], label: 'WH40K.Sheet.RogueTrader' },
            { sheet: BlackCrusadePlayerSheet, types: ['bc-character'], label: 'WH40K.Sheet.BlackCrusade' },
            { sheet: OnlyWarPlayerSheet, types: ['ow-character'], label: 'WH40K.Sheet.OnlyWar' },
            { sheet: DeathwatchPlayerSheet, types: ['dw-character'], label: 'WH40K.Sheet.Deathwatch' },
            { sheet: ImperiumMaledictumPlayerSheet, types: ['im-character'], label: 'WH40K.Sheet.ImperiumMaledictum' },
            // Per-system default NPC sheets
            { sheet: DarkHeresy2NPCSheet, types: ['dh2-npc'], label: 'WH40K.Sheet.DarkHeresy2NPC' },
            { sheet: DarkHeresy1NPCSheet, types: ['dh1-npc'], label: 'WH40K.Sheet.DarkHeresy1NPC' },
            { sheet: RogueTraderNPCSheet, types: ['rt-npc'], label: 'WH40K.Sheet.RogueTraderNPC' },
            { sheet: BlackCrusadeNPCSheet, types: ['bc-npc'], label: 'WH40K.Sheet.BlackCrusadeNPC' },
            { sheet: OnlyWarNPCSheet, types: ['ow-npc'], label: 'WH40K.Sheet.OnlyWarNPC' },
            { sheet: DeathwatchNPCSheet, types: ['dw-npc'], label: 'WH40K.Sheet.DeathwatchNPC' },
            { sheet: ImperiumMaledictumNPCSheet, types: ['im-npc'], label: 'WH40K.Sheet.ImperiumMaledictumNPC' },
            // Per-system default Craft sheets — each also covers its legacy `{line}-vehicle`
            // (+ -aircraft) type so pre-rename world actors keep rendering until migration.
            { sheet: DarkHeresy2CraftSheet, types: ['dh2-terracraft', 'dh2-aircraft', 'dh2-vehicle'], label: 'WH40K.Sheet.DarkHeresy2Vehicle' },
            { sheet: DarkHeresy1CraftSheet, types: ['dh1-terracraft', 'dh1-vehicle'], label: 'WH40K.Sheet.DarkHeresy1Vehicle' },
            { sheet: RogueTraderCraftSheet, types: ['rt-terracraft', 'rt-aircraft', 'rt-vehicle'], label: 'WH40K.Sheet.RogueTraderVehicle' },
            { sheet: BlackCrusadeCraftSheet, types: ['bc-terracraft', 'bc-vehicle'], label: 'WH40K.Sheet.BlackCrusadeVehicle' },
            { sheet: OnlyWarCraftSheet, types: ['ow-terracraft', 'ow-aircraft', 'ow-vehicle'], label: 'WH40K.Sheet.OnlyWarVehicle' },
            { sheet: DeathwatchCraftSheet, types: ['dw-terracraft', 'dw-aircraft', 'dw-vehicle'], label: 'WH40K.Sheet.DeathwatchVehicle' },
            { sheet: ImperiumMaledictumCraftSheet, types: ['im-terracraft', 'im-vehicle'], label: 'WH40K.Sheet.ImperiumMaledictumVehicle' },
            // Voidcraft (RT only for now); also covers legacy `rt-starship`
            { sheet: RogueTraderVoidcraftSheet, types: ['rt-voidcraft', 'rt-starship'], label: 'WH40K.Sheet.RogueTraderStarship' },
            // Loot pile (content-agnostic, all systems)
            { sheet: LootActorSheet, types: ['loot'], label: 'WH40K.Sheet.Loot' },
        ];
        for (const { sheet, types, label } of ACTOR_SHEETS) {
            DocumentSheetConfig.registerSheet(Actor, SYSTEM_ID, sheet, { ...(types !== undefined ? { types } : {}), makeDefault: true, label });
        }

        // Unregister core V1 item sheet and register V2 item sheets
        DocumentSheetConfig.unregisterSheet(Item, 'core', foundry.appv1.sheets.ItemSheet);

        const ITEM_SHEETS: SheetReg[] = [
            { sheet: BaseItemSheet, label: 'WH40K.Sheet.Item' }, // default for unspecified types
            { sheet: WeaponSheet, types: ['weapon'], label: 'WH40K.Sheet.Weapon' },
            { sheet: ArmourSheet, types: ['armour'], label: 'WH40K.Sheet.Armour' },
            { sheet: TalentSheet, types: ['talent'], label: 'WH40K.Sheet.Talent' },
            { sheet: TraitSheet, types: ['trait'], label: 'WH40K.Sheet.Trait' },
            { sheet: GearSheet, types: ['gear', 'consumable', 'drug', 'tool', 'miscellaneous'], label: 'WH40K.Sheet.Gear' },
            { sheet: AmmoSheet, types: ['ammunition'], label: 'WH40K.Sheet.Ammunition' },
            { sheet: PsychicPowerSheet, types: ['psychicPower'], label: 'WH40K.Sheet.PsychicPower' },
            { sheet: SkillSheet, types: ['skill'], label: 'WH40K.Sheet.Skill' },
            { sheet: CyberneticSheet, types: ['cybernetic'], label: 'WH40K.Sheet.Cybernetic' },
            { sheet: ForceFieldSheet, types: ['forceField'], label: 'WH40K.Sheet.ForceField' },
            { sheet: CriticalInjurySheet, types: ['criticalInjury'], label: 'WH40K.Sheet.CriticalInjury' },
            { sheet: ConditionSheet, types: ['condition'], label: 'WH40K.Sheet.Condition' },
            // Content-block sheets (freeform-gated)
            { sheet: SpecialAbilitySheet, types: ['specialAbility'], label: 'WH40K.Sheet.SpecialAbility' },
            { sheet: MalignancySheet, types: ['malignancy'], label: 'WH40K.Sheet.Malignancy' },
            { sheet: MutationSheet, types: ['mutation'], label: 'WH40K.Sheet.Mutation' },
            { sheet: MentalDisorderSheet, types: ['mentalDisorder'], label: 'WH40K.Sheet.MentalDisorder' },
            { sheet: StorageLocationSheet, types: ['storageLocation'], label: 'WH40K.Sheet.StorageLocation' },
            { sheet: LocationSheet, types: ['location'], label: 'WH40K.Sheet.Location' },
            { sheet: PeerEnemySheet, types: ['peer', 'enemy'], label: 'WH40K.Sheet.PeerEnemy' },
            { sheet: JournalEntryItemSheet, types: ['journalEntry'], label: 'WH40K.Sheet.JournalEntry' },
            { sheet: EndeavourSheet, types: ['endeavour'], label: 'WH40K.Sheet.Endeavour' },
            { sheet: LeadSheet, types: ['lead'], label: 'WH40K.Sheet.Lead' },
            { sheet: OriginPathSheet, types: ['originPath'], label: 'WH40K.Sheet.OriginPath' },
            { sheet: WeaponModSheet, types: ['weaponModification'], label: 'WH40K.Sheet.WeaponMod' },
            { sheet: ArmourModSheet, types: ['armourModification'], label: 'WH40K.Sheet.ArmourMod' },
            { sheet: AttackSpecialSheet, types: ['attackSpecial'], label: 'WH40K.Sheet.AttackSpecial' },
            { sheet: WeaponQualitySheet, types: ['weaponQuality'], label: 'WH40K.Sheet.WeaponQuality' },
            { sheet: ShipComponentSheet, types: ['shipComponent'], label: 'WH40K.Sheet.ShipComponent' },
            { sheet: ShipWeaponSheet, types: ['shipWeapon'], label: 'WH40K.Sheet.ShipWeapon' },
            { sheet: ShipUpgradeSheet, types: ['shipUpgrade'], label: 'WH40K.Sheet.ShipUpgrade' },
            { sheet: NPCTemplateSheet, types: ['npcTemplate'], label: 'WH40K.Sheet.NPCTemplate' },
        ];
        for (const { sheet, types, label } of ITEM_SHEETS) {
            DocumentSheetConfig.registerSheet(Item, SYSTEM_ID, sheet, { ...(types !== undefined ? { types } : {}), makeDefault: true, label });
        }

        WH40KSettings.registerSettings();
        void HandlebarManager.loadTemplates();

        // Register movement actions and Token HUD hooks (after settings are available)
        documents.TokenDocumentWH40K.registerMovementActions();
        documents.TokenDocumentWH40K.registerHUDListeners();
        // eslint-disable-next-line no-restricted-syntax -- boundary: costAggregator callback signature is untyped in fvtt-types; unknown[] is the correct boundary type
        CONFIG.Token.movement.costAggregator = (results: unknown[], _distance: unknown, _segment: unknown) => {
            return Math.max(...results.map((i) => (i as { cost: number }).cost));
        };
    }

    /**
     * Join the canonical compendium body onto every world actor's LEAN items,
     * IN MEMORY (updateSource + reset; no database write — stored records stay
     * lean, so there is nothing on disk for a reload to clobber). Replaces the
     * deleted boot-time DB resync, whose updateEmbeddedDocuments write reconciled
     * the canonical body over the stored record on every GM ready and, when a
     * client ran stale JS, clobbered per-actor fields (talent/power XP cost) back
     * to the compendium's zero. Runs on every client (the join is per-client and
     * non-persisting); gated only by the `resyncOnReady` toggle.
     *
     * Kept as its own method so `ready()` calls it as a plain awaited function
     * (no inline `game` read wrapping the await) — that read-then-await pattern
     * spuriously trips `require-atomic-updates` on the later `game.wh40k.*` writes.
     */
    static async hydrateWorldActorsOnReady(): Promise<void> {
        if (game.settings.get(SYSTEM_ID, WH40KSettings.SETTINGS.resyncOnReady) === false) return;
        await Promise.all(
            game.actors.contents.map(async (actor) => {
                await hydrateActorInMemory(actor);
            }),
        );
    }

    static async ready(): Promise<void> {
        // Register the guided tour first — it is synchronous and independent of
        // the world-data steps below, so registering it up front guarantees it
        // lands even if a later await throws on a minimal/seed world.
        game.tours.register(SYSTEM_ID, 'main-tour', new DHTourMain());

        await checkAndMigrateWorld();
        await HooksManager.hydrateWorldActorsOnReady();
        await uuidNameCache.build();
        await buildWeaponQualityPayloadIndex();
        await backfillOriginPathUuids();
        await reconcileWorldOriginGrants();

        // Initialize rich tooltip system. Capture game.wh40k after the awaits above
        // so the assignment target is the current namespace, not a pre-await read.
        const tooltips = new TooltipsWH40K();
        const wh40k = game.wh40k;
        wh40k.tooltips = tooltips;
        await tooltips.initialize();

        if (game.settings.get(SYSTEM_ID, WH40KSettings.SETTINGS.processActiveEffectsDuringCombat) === false) {
            DHCombatActionManager.disableHooks();
        }
    }

    /* eslint-disable no-restricted-syntax -- boundary: hotbarDrop payload is an untyped Record from Foundry; _bar is unknown per hook contract */
    static hotbarDrop(_bar: unknown, data: Record<string, unknown>, slot: number): boolean {
        /* eslint-enable no-restricted-syntax */
        game.wh40k.log('Hotbar Drop:', data);
        const type = data['type'];
        if (type === 'characteristic') {
            void createCharacteristicMacro(data, slot);
            return false;
        }
        if (type === 'item' || type === 'Item') {
            void createItemMacro(data, slot);
            return false;
        }
        if (type === 'skill') {
            void createSkillMacro(data, slot);
            return false;
        }
        return true;
    }

    // eslint-disable-next-line @typescript-eslint/no-deprecated, no-restricted-syntax -- boundary: CompendiumDirectory is the V14 hook global; Record<string, unknown> is the Foundry hook payload; migration tracked separately
    static renderCompendiumDirectory(_app: CompendiumDirectory, html: JQuery, _data: Record<string, unknown>): void {
        const rawRoot = html[0] as HTMLElement | undefined;
        // eslint-disable-next-line no-restricted-syntax -- boundary: html may be a JQuery or HTMLElement; cast through unknown is necessary for V13/V14 compat
        const root: HTMLElement | null = rawRoot instanceof HTMLElement ? rawRoot : (html as unknown as HTMLElement | null);
        // eslint-disable-next-line @typescript-eslint/no-deprecated -- third-party @types annotation flags HTMLElement.querySelector as deprecated; the DOM method itself is not
        if (root === null || typeof root.querySelector !== 'function') return;
        const header = root.querySelector('.directory-header');
        if (header === null) return;

        if (header.querySelector('.wh40k-compendium-browser-btn') !== null) return;

        const browserBtn = document.createElement('button');
        browserBtn.type = 'button';
        browserBtn.className =
            'wh40k-compendium-browser-btn tw-bg-gradient-to-br tw-from-[var(--wh40k-gold-dark)] tw-to-[var(--wh40k-gold)] tw-border tw-border-solid tw-border-[var(--wh40k-gold)] tw-rounded tw-text-[var(--wh40k-sheet-bg)] tw-text-xs tw-font-semibold tw-px-2 tw-py-1 tw-cursor-pointer tw-mr-1';
        browserBtn.title = 'Open Compendium Browser';
        browserBtn.innerHTML = '<i class="fas fa-search tw-mr-1"></i> Compendium Browser';

        browserBtn.addEventListener('click', (event) => {
            event.preventDefault();
            void RTCompendiumBrowser.open();
        });

        const actions = header.querySelector('.header-actions');
        if (actions !== null) actions.prepend(browserBtn);
    }

    /**
     * Auto-select appropriate sheet for npcV2 actors based on primaryUse field.
     * Hook: getActorSheetClass
     */
    static getActorSheetClass(actor: Actor, sheetData: Record<string, { id: string; default?: boolean }>): string | null {
        // Only handle npcV2 actors
        if ((actor.type as string) !== 'npcV2') return null;

        // Check primaryUse field
        // eslint-disable-next-line no-restricted-syntax -- boundary: actor.system is DataModel-backed but primaryUse field access requires index signature; fix defineSchema() is tracked separately
        const primaryUse = (actor.system as Record<string, unknown>)['primaryUse'];

        // Auto-select a craft sheet for vehicle/ship NPCs
        if (primaryUse === 'vehicle' || primaryUse === 'ship') {
            // Find the first registered craft/voidcraft sheet
            const craftSheet = Object.values(sheetData).find((s) => /Craft|Voidcraft/.test(s.id));
            if (craftSheet) {
                return craftSheet.id;
            }
        }

        // Default to NPCSheet for standard NPCs
        return null; // Let default handling work
    }
}
