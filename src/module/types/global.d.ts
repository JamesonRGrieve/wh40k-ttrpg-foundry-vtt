/**
 * Global type declarations for the WH40K RPG Foundry VTT System.
 * Augments Foundry VTT types with system-specific extensions.
 *
 * BOUNDARY FILE: this file augments Foundry V14's untyped global namespace and shapes
 * the WH40K-specific extensions to it. Per CLAUDE.md, framework boundaries (Foundry
 * hook payloads, untyped V14 APIs, third-party data with no shipped types) are
 * permitted to use `Record<string, unknown>` and `unknown`. We disable the relevant
 * lint rules at the file level here. New non-boundary code MUST NOT live in this file.
 */

import type * as characterCreation from '../applications/character-creation/_module.ts';
import type { CogitatorTerminal, CogitatorTerminalOptions } from '../applications/cogitator/cogitator-terminal.ts';
import type { RTCompendiumBrowser } from '../applications/compendium-browser.ts';
import type * as npcApplications from '../applications/npc/_module.ts';
import type { WH40KSystemConfig } from '../config.ts';
import type ActorDataModel from '../data/abstract/actor-data-model.ts';
import type ItemDataModel from '../data/abstract/item-data-model.ts';
import type * as dice from '../dice/_module.ts';
import type { WH40KBaseActor } from '../documents/base-actor.ts';
import type { WH40KItem } from '../documents/item.ts';
import type { RollTableUtils } from '../utils/roll-table-utils.ts';

// =========================================================================
// WH40K System Types
// =========================================================================

/** Characteristic data structure */
export interface WH40KCharacteristic {
    label: string;
    short: string;
    base: number;
    starting?: number;
    advance: number;
    advances?: number;
    modifier: number;
    unnatural: number;
    total: number;
    bonus: number;
    /** Effective (post-modifier) characteristic value — alias of `total` (#415). */
    effectiveValue?: number;
    /** Sum of bonus-only modifiers ("+X Bonus" effects), 0 when none (#415). */
    bonusModifier?: number;
    /** Effective bonus = base bonus + bonusModifier; read by damage / carry / movement (#415). */
    effectiveBonus?: number;
}

/** Skill data structure */
export interface WH40KSkill {
    label?: string;
    characteristic: string;
    advanced: boolean;
    basic?: boolean;
    trained: boolean;
    plus10: boolean;
    plus20: boolean;
    plus30?: boolean;
    bonus: number;
    notes: string;
    cost: number;
    current: number;
    entries?: WH40KSkillEntry[];
}

/** Skill entry for specialist skills */
export interface WH40KSkillEntry {
    name: string;
    slug: string;
    characteristic: string;
    advanced: boolean;
    basic: boolean;
    trained: boolean;
    plus10: boolean;
    plus20: boolean;
    plus30?: boolean;
    bonus: number;
    notes: string;
    cost: number;
    current: number;
}

/** Wounds data structure */
export interface WH40KWounds {
    value: number;
    max: number;
    critical: number;
}

/** Fate data structure */
export interface WH40KFate {
    value: number;
    max: number;
    /**
     * Burn-fate / cheat-death threshold (core.md §"Fate Threshold").
     * Set from origin-path grants; consulted by `creature.ts:fate.threshold`.
     */
    threshold: number;
    total?: number;
    rolled?: boolean;
}

/** Initiative data structure */
export interface WH40KInitiative {
    base: number;
    bonus: number;
    characteristic?: string;
}

/** Movement data structure */
export interface WH40KMovement {
    half: number;
    full: number;
    charge: number;
    run: number;
}

/** Modifier breakdown entry */
export interface WH40KModifierEntry {
    source: string;
    value: number;
    uuid?: string | null;
    icon: string;
}

/** Stat breakdown result */
export interface WH40KStatBreakdown {
    label: string;
    base: number;
    modifiers: WH40KModifierEntry[];
    total: number;
}

/** Description object structure */
export interface WH40KDescription {
    value: string;
    chat: string;
    summary: string;
}

/** Source reference structure */
export interface WH40KSourceReference {
    book: string;
    page: string;
    custom: string;
}

/** Roll configuration for talents */
export interface WH40KRollConfig {
    characteristic?: string;
    modifier?: number;
    description?: string;
}

/** Item modifiers structure */
export interface WH40KItemModifiers {
    characteristics?: Record<string, number>;
    skills?: Record<string, number>;
    combat?: Record<string, number>;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry DataModel `system.modifiers.resources` open map (per-system resource keys vary)
    resources?: { wounds?: number; fate?: number; [key: string]: unknown };
    other?: Array<{ key: string; value: number; label?: string }>;
    wounds?: number;
    fate?: number;
    talents?: string[];
}

/** Armour location data */
export interface WH40KArmourLocation {
    value: number;
    total: number;
    toughnessBonus: number;
    traitBonus: number;
}

export interface WH40KActorBio {
    playerName?: string;
    gender?: string;
    age?: string | number;
    height?: string;
    weight?: string;
    homeworld?: string;
    notes?: string;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry DataModel `system.bio` open map (per-system bio fields vary)
    [key: string]: unknown;
}

export interface WH40KExperience {
    used: number;
    total: number;
    available: number;
}

export interface WH40KEncumbrance {
    value: number;
    max: number;
    over: boolean;
    backpack_max?: number;
    backpack_value?: number;
}

export interface WH40KFatigue {
    value: number;
    max: number;
}

export interface WH40KCorruptionInsanity {
    value: number;
    max?: number;
    degree?: number;
}

export interface WH40KPsy {
    rating: number;
    discipline: string;
    powers: string[];
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry DataModel `system.psy` open map (per-system psy fields vary)
    [key: string]: unknown;
}

export interface WH40KBackpack {
    weightCapacity?: number;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry embedded Item documents (heterogeneous owned-item list)
    contents?: unknown[];
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry DataModel `system.backpack` open map (per-system backpack fields vary)
    [key: string]: unknown;
}

export type WH40KActorSystemData = ActorDataModel & {
    characteristics: Record<string, WH40KCharacteristic>;
    skills: Record<string, WH40KSkill>;
    trainedSkills?: Record<string, WH40KSkill>;
    initiative: WH40KInitiative;
    wounds: WH40KWounds;
    movement: WH40KMovement;
    size: string | number;
    fatigue?: WH40KFatigue;
    fate?: WH40KFate;
    backpack?: WH40KBackpack;
    psy?: WH40KPsy;
    bio?: WH40KActorBio;
    experience?: WH40KExperience;
    insanity?: WH40KCorruptionInsanity;
    corruption?: WH40KCorruptionInsanity;
    aptitudes?: Set<string> | string[];
    armour?: Record<string, WH40KArmourLocation> & {
        mode?: 'simple' | 'locations';
        total?: number;
        toughnessBonus?: number;
        traitBonus?: number;
    };
    encumbrance?: WH40KEncumbrance;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry DataModel `system.backgroundEffects` (heterogeneous origin-path effect list)
    backgroundEffects?: unknown[];
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry DataModel `system.originPath` open sub-object
    originPath?: Record<string, unknown>;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry DataModel `system.rogueTrader` open sub-object (RT-only)
    rogueTrader?: Record<string, unknown>;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry DataModel `system.modifierSources` open map (modifier-tracking projection)
    modifierSources?: Record<string, unknown>;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry DataModel `system.combatActions` (heterogeneous combat-action list)
    combatActions?: unknown[];
    totalFateModifier?: number;
    threatLevel?: number;
    threatTier?: string;
    tags?: string[];
    horde?: { enabled: boolean; magnitude: { max: number; current: number } };
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry DataModel `system.crew` open sub-object (RT starship)
    crew?: Record<string, unknown>;
    integrity?: { value: number; max: number };
    morale?: { value: number; max: number };
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry DataModel `system.propulsion` open sub-object (RT starship)
    propulsion?: Record<string, unknown>;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry DataModel `system.detection` open sub-object (RT starship)
    detection?: Record<string, unknown>;
    detectionBonus?: number;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry DataModel `schema` runtime descriptor (untyped V14 SchemaField)
    schema?: unknown;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry DataModel `_source` raw persisted payload
    _source?: Record<string, unknown>;
    prepareEmbeddedData?: () => void;
    _initializeModifierTracking?: () => void;
    prepareDerivedData?: () => void;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry DataModel method `addTrainedSkill` open options bag (passes through to document.update)
    addTrainedSkill?: (key: string, options?: Record<string, unknown>) => Promise<void>;
    removeSkill?: (key: string) => Promise<void>;
    pinAbility?: (id: string) => Promise<void>;
    unpinAbility?: (id: string) => Promise<void>;
    switchArmourMode?: (mode: 'simple' | 'locations') => Promise<void>;
    toggleHordeMode?: () => Promise<void>;
    applyMagnitudeDamage?: (amount: number, source?: string) => Promise<void>;
    restoreMagnitude?: (amount: number) => Promise<void>;
    // Restored stop-gap: 63efd474 removed this claiming "typecheck remains clean";
    // it did not — 55 downstream errors surface without it. Proper fix is to
    // narrow per-call-site or add specific fields to the typed DataModels,
    // not to keep this signature long-term.
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry actor DataModel `system` index-signature stop-gap (see comment above; 55 downstream errors without it)
    [key: string]: unknown;
};

export type WH40KItemSystemData = ItemDataModel & {
    state?: {
        equipped?: boolean;
        inBackpack?: boolean;
        inShipStorage?: boolean;
        container?: string | null;
        activated?: boolean;
        overloaded?: boolean;
    };
    quantity?: number;
    reload?: string;
    class?: string;
    type?: string;
    step?: string;
    weight?: number;
    craftsmanship?: string;
    availability?: string;
    cost?: number | string;
    damage?: string | { value: string; bonus?: number };
    penetration?: number;
    range?: number | string;
    rateOfFire?: { single: number; semi: number; full: number } | string;
    clip?: { value: number; max: number; type?: string };
    attackType?: string;
    detection?: number;
    detectionBonus?: number;
    description?: WH40KDescription;
    source?: WH40KSourceReference;
    modifiers?: WH40KItemModifiers;
    talents?: string[];
    aptitudes?: string[];
    cls?: string;
    tier?: number | string;
    rarity?: string;
    hasGrants?: boolean;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry item DataModel `system.grants` (heterogeneous grant-entry list)
    grants?: unknown[];
    isMeleeWeapon?: boolean;
    isRangedWeapon?: boolean;
    melee?: boolean;
    // See WH40KActorSystemData above — same stop-gap, same follow-up.
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry item DataModel `system` index-signature stop-gap (see WH40KActorSystemData)
    [key: string]: unknown;
};

// =========================================================================
// WH40K System Namespace on Game
// =========================================================================

interface TooltipsWH40K {
    initialize: () => Promise<void>;
}

// =========================================================================
// WH40K System Namespace on Game
// =========================================================================

export interface WH40KGameSystem {
    debug: boolean;
    // eslint-disable-next-line no-restricted-syntax -- boundary: console-style varargs payload for `game.wh40k.log`
    log: (s: string, o?: unknown) => void;
    // eslint-disable-next-line no-restricted-syntax -- boundary: console-style varargs payload for `game.wh40k.warn`
    warn: (s: string, o?: unknown) => void;
    // eslint-disable-next-line no-restricted-syntax -- boundary: console-style varargs payload for `game.wh40k.error`
    error: (s: string, o?: unknown) => void;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry hotbar Macro `data` payload + heterogeneous roll result
    rollItemMacro: (data: Record<string, unknown>, slot: number) => Promise<unknown>;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry hotbar Macro `data` payload + heterogeneous roll result
    rollSkillMacro: (data: Record<string, unknown>, slot: number) => Promise<unknown>;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry hotbar Macro `data` payload + heterogeneous roll result
    rollCharacteristicMacro: (data: Record<string, unknown>, slot: number) => Promise<unknown>;
    rollTable: typeof RollTableUtils;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry roll-pipeline modifier input + heterogeneous roll result (`game.wh40k.rollPsychicPhenomena`)
    rollPsychicPhenomena: (actor: WH40KBaseActor, mod?: unknown) => Promise<unknown>;
    // eslint-disable-next-line no-restricted-syntax -- boundary: heterogeneous Foundry roll result (`game.wh40k.rollPerilsOfTheWarp`)
    rollPerilsOfTheWarp: (actor: WH40KBaseActor) => Promise<unknown>;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry roll-table inputs + heterogeneous result (`game.wh40k.rollFearEffects`)
    rollFearEffects: (fear: unknown, dof: unknown) => Promise<unknown>;
    // eslint-disable-next-line no-restricted-syntax -- boundary: heterogeneous Foundry roll-table result (`game.wh40k.rollMutation`)
    rollMutation: () => Promise<unknown>;
    // eslint-disable-next-line no-restricted-syntax -- boundary: heterogeneous Foundry roll-table result (`game.wh40k.rollMalignancy`)
    rollMalignancy: () => Promise<unknown>;
    // eslint-disable-next-line no-restricted-syntax -- boundary: heterogeneous Foundry dialog result (`game.wh40k.showRollTableDialog`)
    showRollTableDialog: () => Promise<unknown>;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ApplicationV2 render-options bag (`game.wh40k.openCompendiumBrowser`)
    openCompendiumBrowser: (options?: Record<string, unknown>) => Promise<RTCompendiumBrowser>;
    openCogitator: (options?: CogitatorTerminalOptions) => Promise<CogitatorTerminal>;
    OriginPathBuilder: typeof characterCreation.OriginPathBuilder;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ApplicationV2 render-options bag + heterogeneous result (`game.wh40k.openOriginPathBuilder`)
    openOriginPathBuilder: (actor: WH40KBaseActor, options?: Record<string, unknown>) => Promise<unknown>;
    npc: typeof npcApplications;
    applications: typeof npcApplications;
    ThreatCalculator: typeof npcApplications.ThreatCalculator;
    // eslint-disable-next-line no-restricted-syntax -- boundary: open NPC-generator config + heterogeneous Foundry Actor result (`game.wh40k.quickCreateNPC`)
    quickCreateNPC: (config?: unknown) => Promise<unknown>;
    // eslint-disable-next-line no-restricted-syntax -- boundary: open NPC-generator config + heterogeneous Foundry Actor result (`game.wh40k.batchCreateNPCs`)
    batchCreateNPCs: (config?: unknown) => Promise<unknown>;
    // eslint-disable-next-line no-restricted-syntax -- boundary: heterogeneous Foundry dialog result (`game.wh40k.openEncounterBuilder`)
    openEncounterBuilder: () => Promise<unknown>;
    // eslint-disable-next-line no-restricted-syntax -- boundary: open stat-block export format + heterogeneous result (`game.wh40k.exportStatBlock`)
    exportStatBlock: (actor: WH40KBaseActor, format?: unknown) => Promise<unknown>;
    // eslint-disable-next-line no-restricted-syntax -- boundary: open stat-block import payload + heterogeneous Foundry Actor result (`game.wh40k.importStatBlock`)
    importStatBlock: (input?: unknown) => Promise<unknown>;
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ApplicationV2 render-options bag + heterogeneous result (`game.wh40k.openTemplateSelector`)
    openTemplateSelector: (options?: Record<string, unknown>) => Promise<unknown>;
    DifficultyCalculatorDialog: typeof npcApplications.DifficultyCalculatorDialog;
    // eslint-disable-next-line no-restricted-syntax -- boundary: heterogeneous Foundry dialog result (`game.wh40k.calculateDifficulty`)
    calculateDifficulty: (actor: WH40KBaseActor) => Promise<unknown>;
    CombatPresetDialog: typeof npcApplications.CombatPresetDialog;
    // eslint-disable-next-line no-restricted-syntax -- boundary: heterogeneous Foundry dialog result (`game.wh40k.savePreset`)
    savePreset: (actor: WH40KBaseActor) => Promise<unknown>;
    // eslint-disable-next-line no-restricted-syntax -- boundary: heterogeneous Foundry dialog result (`game.wh40k.loadPreset`)
    loadPreset: (actor: WH40KBaseActor) => Promise<unknown>;
    // eslint-disable-next-line no-restricted-syntax -- boundary: heterogeneous Foundry dialog result (`game.wh40k.openPresetLibrary`)
    openPresetLibrary: () => Promise<unknown>;
    dice: typeof dice;
    BasicRollWH40K: typeof dice.BasicRollWH40K;
    D100Roll: typeof dice.D100Roll;
    tooltips: TooltipsWH40K;
}

// =========================================================================
// Module Augmentation for Foundry VTT types
// =========================================================================

declare global {
    // Use AssumeHookRan to make game always ReadyGame
    interface AssumeHookRan {
        ready: true;
        init: true;
        i18nInit: true;
        setup: true;
    }

    interface WH40KNotifications {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry global `ui.notifications.info` open options bag
        info: (message: string, options?: Record<string, unknown>) => void;
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry global `ui.notifications.warn` open options bag
        warn: (message: string, options?: Record<string, unknown>) => void;
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry global `ui.notifications.error` open options bag
        error: (message: string, options?: Record<string, unknown>) => void;
    }

    interface SceneControlTool {
        name: string;
        title: string;
        icon: string;
        visible: boolean;
        onClick: () => void | Promise<void>;
        button?: boolean;
        toggle?: boolean;
        active?: boolean;
        order?: number;
    }

    interface SceneControl {
        name: string;
        title: string;
        layer: string;
        icon: string;
        visible: boolean;
        tools: Record<string, SceneControlTool>;
        activeTool: string;
    }

    interface ClientSettingRegistration {
        name?: string;
        hint?: string;
        scope?: 'world' | 'client' | 'user';
        config?: boolean;
        requiresReload?: boolean;
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry global `ClientSettings.register` data.type constructor (Number/String/Boolean/DataModel)
        type?: unknown;
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry global `ClientSettings.register` data.default value (typed by data.type)
        default?: unknown;
        choices?: Record<string, string>;
        range?: { min: number; max: number; step?: number };
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry global `ClientSettings.register` onChange value (typed by data.type)
        onChange?: (value: unknown) => void;
        filePicker?: boolean | string;
    }

    interface ClientSettings {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry global `game.settings.get` returns the registered setting's value (typed at the call site by its registration)
        get: (module: string, key: string) => unknown;
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry global `game.settings.set` value + result (typed at the call site by its registration)
        set: (module: string, key: string, value: unknown) => Promise<unknown>;
        register: (module: string, key: string, data: ClientSettingRegistration) => void;
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry global `game.settings.settings` heterogeneous registration map
        settings: Map<string, unknown>;
    }

    interface FoundrySidebar {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry global `ui.sidebar.tabs` heterogeneous tab-app map
        tabs: Record<string, unknown>;
        activateTab: (name: string) => void;
    }

    interface FoundryControls {
        controls: Record<string, SceneControl>;
        activeControl: string;
        render: (force?: boolean) => void;
    }

    interface UI {
        notifications: WH40KNotifications;
        sidebar: FoundrySidebar;
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry global `ui.chat` scrollBottom options + postOne varargs
        chat: { scrollBottom: (options?: Record<string, unknown>) => void; postOne?: (...args: unknown[]) => void };
        combat: { render: (force?: boolean) => void };
        compendium: { render: (force?: boolean) => void };
        controls: FoundryControls;
        players: { render: (force?: boolean) => void };
        settings: { render: (force?: boolean) => void };
        tables: { render: (force?: boolean) => void };
        tours: { render: (force?: boolean) => void };
        nav: { render: (force?: boolean) => void };
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry global `canvas.hud.bubbles.say` Token arg + open options bag
        bubbles: { say: (token: unknown, message: string, options?: Record<string, unknown>) => void };
        broadcaster: { render: (force?: boolean) => void };
        menu: { render: (force?: boolean) => void };
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry global `ui.activeWindow` heterogeneous ApplicationV2 reference
        activeWindow: unknown;
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry global `ui.windows` heterogeneous app-by-id map
        windows: Record<number, unknown>;
    }

    interface CompendiumIndexEntry {
        _id: string;
        name: string;
        type?: string;
        img?: string;
        uuid?: string;
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry global `CompendiumCollection` index entry open map (indexed fields vary per pack)
        [key: string]: unknown;
    }

    interface CompendiumPack {
        documentName: string;
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry global `CompendiumCollection.metadata` open map (extra package metadata varies)
        metadata: { id: string; label: string; package: string; type: string; system?: string; [key: string]: unknown };
        index: foundry.utils.Collection<CompendiumIndexEntry>;
        getIndex: (options?: { fields?: string[] }) => Promise<foundry.utils.Collection<CompendiumIndexEntry>>;
        getDocument: (id: string) => Promise<foundry.abstract.Document.Any | undefined>;
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry global `CompendiumCollection.getDocuments` open query payload
        getDocuments: (query?: Record<string, unknown>) => Promise<foundry.abstract.Document.Any[]>;
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry global `CompendiumCollection.importDocument` open options bag
        importDocument: (document: foundry.abstract.Document.Any, options?: Record<string, unknown>) => Promise<foundry.abstract.Document.Any>;
    }

    // Augment ReadyGame to include wh40k
    interface ReadyGame {
        wh40k: WH40KGameSystem;
    }
    interface CONFIG {
        // Only `wh40k` (lowercase) is assigned at runtime by `hooks-manager.ts`.
        // An older `WH40K` (uppercase) augmentation was present here but never
        // assigned — this type lie hid runtime crashes (Cannot read properties of
        // undefined ...) on every call site that touched it. If a new namespace
        // needs adding, ALSO add the assignment.
        wh40k: WH40KSystemConfig;
    }
}

export type WH40KBaseActorDocument = WH40KBaseActor;

export type WH40KItemDocument = WH40KItem;

/** Extended render context for WH40K application sheets */
// eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ApplicationV2 render context (open template-data map passed to Handlebars)
export interface WH40KRenderContext extends Record<string, unknown> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry ApplicationV2 `tabs` render-context map (heterogeneous tab descriptors)
    tabs?: Record<string, unknown>;
}
