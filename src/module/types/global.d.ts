/* eslint-disable @typescript-eslint/no-unused-vars -- ambient type declarations for consumer use */
/**
 * Global type declarations for the WH40K RPG Foundry VTT System.
 * Augments Foundry VTT types with system-specific extensions.
 */

import type * as characterCreation from '../applications/character-creation/_module.ts';
import type { RTCompendiumBrowser } from '../applications/compendium-browser.ts';
import type * as npcApplications from '../applications/npc/_module.ts';
import type { WH40KSystemConfig } from '../config.ts';
import type ActorDataModel from '../data/abstract/actor-data-model.ts';
import type ItemDataModel from '../data/abstract/item-data-model.ts';
import type * as dice from '../dice/_module.ts';
import type { WH40KBaseActor } from '../documents/base-actor.ts';
import type { WH40KItem } from '../documents/item.ts';
import type { TransactionManager } from '../transactions/transaction-manager.ts';
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
    [key: string]: unknown;
}

export interface WH40KBackpack {
    weightCapacity?: number;
    contents?: unknown[];
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
    backgroundEffects?: unknown[];
    originPath?: Record<string, unknown>;
    rogueTrader?: Record<string, unknown>;
    modifierSources?: Record<string, unknown>;
    combatActions?: unknown[];
    totalFateModifier?: number;
    threatLevel?: number;
    threatTier?: string;
    tags?: string[];
    horde?: { enabled: boolean; magnitude: { max: number; current: number } };
    crew?: Record<string, unknown>;
    integrity?: { value: number; max: number };
    morale?: { value: number; max: number };
    propulsion?: Record<string, unknown>;
    detection?: Record<string, unknown>;
    detectionBonus?: number;
    schema?: unknown;
    _source?: Record<string, unknown>;
    prepareEmbeddedData?: () => void;
    _initializeModifierTracking?: () => void;
    prepareDerivedData?: () => void;
    addTrainedSkill?: (key: string, options?: Record<string, unknown>) => Promise<void>;
    removeSkill?: (key: string) => Promise<void>;
    pinAbility?: (id: string) => Promise<void>;
    unpinAbility?: (id: string) => Promise<void>;
    switchArmourMode?: (mode: 'simple' | 'locations') => Promise<void>;
    toggleHordeMode?: () => Promise<void>;
    applyMagnitudeDamage?: (amount: number, source?: string) => Promise<void>;
    restoreMagnitude?: (amount: number) => Promise<void>;
    [key: string]: unknown;
};

export type WH40KItemSystemData = ItemDataModel & {
    equipped?: boolean;
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
    container?: string | null;
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
    grants?: unknown[];
    isMeleeWeapon?: boolean;
    isRangedWeapon?: boolean;
    melee?: boolean;
    [key: string]: unknown;
};

// =========================================================================
// WH40K System Namespace on Game
// =========================================================================

interface TooltipsWH40K {
    initialize(): Promise<void>;
}

// =========================================================================
// WH40K System Namespace on Game
// =========================================================================

export interface WH40KGameSystem {
    debug: boolean;
    log: (s: string, o?: unknown) => void;
    warn: (s: string, o?: unknown) => void;
    error: (s: string, o?: unknown) => void;
    rollItemMacro: (data: Record<string, unknown>, slot: number) => Promise<unknown>;
    rollSkillMacro: (data: Record<string, unknown>, slot: number) => Promise<unknown>;
    rollCharacteristicMacro: (data: Record<string, unknown>, slot: number) => Promise<unknown>;
    rollTable: typeof RollTableUtils;
    rollPsychicPhenomena: (actor: WH40KBaseActor, mod?: unknown) => Promise<unknown>;
    rollPerilsOfTheWarp: (actor: WH40KBaseActor) => Promise<unknown>;
    rollFearEffects: (fear: unknown, dof: unknown) => Promise<unknown>;
    rollMutation: () => Promise<unknown>;
    rollMalignancy: () => Promise<unknown>;
    showRollTableDialog: () => Promise<unknown>;
    openCompendiumBrowser: (options?: Record<string, unknown>) => Promise<RTCompendiumBrowser>;
    OriginPathBuilder: typeof characterCreation.OriginPathBuilder;
    openOriginPathBuilder: (actor: WH40KBaseActor, options?: Record<string, unknown>) => Promise<unknown>;
    npc: typeof npcApplications;
    applications: typeof npcApplications;
    ThreatCalculator: typeof npcApplications.ThreatCalculator;
    quickCreateNPC: (config?: unknown) => Promise<unknown>;
    batchCreateNPCs: (config?: unknown) => Promise<unknown>;
    openEncounterBuilder: () => Promise<unknown>;
    exportStatBlock: (actor: WH40KBaseActor, format?: unknown) => Promise<unknown>;
    importStatBlock: (input?: unknown) => Promise<unknown>;
    openTemplateSelector: (options?: Record<string, unknown>) => Promise<unknown>;
    DifficultyCalculatorDialog: typeof npcApplications.DifficultyCalculatorDialog;
    calculateDifficulty: (actor: WH40KBaseActor) => Promise<unknown>;
    CombatPresetDialog: typeof npcApplications.CombatPresetDialog;
    savePreset: (actor: WH40KBaseActor) => Promise<unknown>;
    loadPreset: (actor: WH40KBaseActor) => Promise<unknown>;
    openPresetLibrary: () => Promise<unknown>;
    transaction: TransactionManager;
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

    interface Notifications {
        info: (message: string, options?: Record<string, unknown>) => void;
        warn: (message: string, options?: Record<string, unknown>) => void;
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
        type?: unknown;
        default?: unknown;
        choices?: Record<string, string>;
        range?: { min: number; max: number; step?: number };
        onChange?: (value: unknown) => void;
        filePicker?: boolean | string;
    }

    interface ClientSettings {
        get(module: string, key: string): unknown;
        set(module: string, key: string, value: unknown): Promise<unknown>;
        register(module: string, key: string, data: ClientSettingRegistration): void;
        settings: Map<string, unknown>;
    }

    interface FoundrySidebar {
        tabs: Record<string, unknown>;
        activateTab(name: string): void;
    }

    interface FoundryControls {
        controls: Record<string, SceneControl>;
        activeControl: string;
        render(force?: boolean): void;
    }

    interface UI {
        notifications: Notifications;
        sidebar: FoundrySidebar;
        chat: { scrollBottom(options?: Record<string, unknown>): void; postOne?(...args: unknown[]): void };
        combat: { render(force?: boolean): void };
        compendium: { render(force?: boolean): void };
        controls: FoundryControls;
        players: { render(force?: boolean): void };
        settings: { render(force?: boolean): void };
        tables: { render(force?: boolean): void };
        tours: { render(force?: boolean): void };
        nav: { render(force?: boolean): void };
        bubbles: { say(token: unknown, message: string, options?: Record<string, unknown>): void };
        broadcaster: { render(force?: boolean): void };
        menu: { render(force?: boolean): void };
        activeWindow: unknown;
        windows: Record<number, unknown>;
    }

    interface CompendiumIndexEntry {
        _id: string;
        name: string;
        type?: string;
        img?: string;
        uuid?: string;
        [key: string]: unknown;
    }

    interface CompendiumPack {
        documentName: string;
        metadata: { id: string; label: string; package: string; type: string; system?: string; [key: string]: unknown };
        index: foundry.utils.Collection<CompendiumIndexEntry>;
        getIndex(options?: { fields?: string[] }): Promise<foundry.utils.Collection<CompendiumIndexEntry>>;
        getDocument(id: string): Promise<foundry.abstract.Document.Any | undefined>;
        getDocuments(query?: Record<string, unknown>): Promise<foundry.abstract.Document.Any[]>;
        importDocument(document: foundry.abstract.Document.Any, options?: Record<string, unknown>): Promise<foundry.abstract.Document.Any>;
    }

    // Augment ReadyGame to include wh40k
    interface ReadyGame {
        wh40k: WH40KGameSystem;
    }
    interface CONFIG {
        wh40k: WH40KSystemConfig;
        WH40K: WH40KSystemConfig;
    }
}

export type WH40KBaseActorDocument = WH40KBaseActor;

export type WH40KItemDocument = WH40KItem;

/** Extended render context for WH40K application sheets */
export interface WH40KRenderContext extends Record<string, unknown> {
    tabs?: Record<string, unknown>;
}

export {};
