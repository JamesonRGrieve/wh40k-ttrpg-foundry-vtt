/* eslint-disable @typescript-eslint/no-unused-vars -- ambient type declarations for consumer use */
/**
 * Global type declarations for the WH40K RPG Foundry VTT System.
 * Augments Foundry VTT types with system-specific extensions.
 */

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
    uuid?: string;
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
    other?: Array<{ key: string; value: number }>;
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

import type { WH40KBaseActor } from '../documents/base-actor.ts';
import type { WH40KItem } from '../documents/item.ts';
import type { RTCompendiumBrowser } from '../applications/compendium-browser.ts';
import type { TransactionManager } from '../transactions/transaction-manager.ts';
import type { RollTableUtils } from '../utils/roll-table-utils.ts';
import type * as dice from '../dice/_module.ts';
import type * as npcApplications from '../applications/npc/_module.ts';
import type * as characterCreation from '../applications/character-creation/_module.ts';

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

    interface ClientSettings {
        get(module: string, key: string): any;
        set(module: string, key: string, value: any): Promise<any>;
        register(module: string, key: string, data: any): void;
        settings: Map<string, any>;
    }

    interface UI {
        notifications: Notifications;
        sidebar: any;
        chat: any;
        combat: any;
        compendium: any;
        controls: any;
        players: any;
        settings: any;
        tables: any;
        tours: any;
        nav: any;
        bubbles: any;
        broadcaster: any;
        menu: any;
        activeWindow: any;
        windows: Record<number, any>;
    }

    // Augment ReadyGame to include wh40k
    interface ReadyGame {
        wh40k: WH40KGameSystem;
        actors: any;
        items: any;
        users: any;
        scenes: any;
        packs: any;
        settings: ClientSettings;
        userId: string;
        user: any;
        tours: any;
    }

    let game: ReadyGame;
    let canvas: Canvas;
    let ui: UI;
    let CONFIG: any;
    let Hooks: any;
    let Actor: any;
    let Item: any;
    let ChatMessage: any;
    let Roll: any;
    let TextEditor: any;
    let fromUuid: (uuid: string) => Promise<any>;
    let renderTemplate: (template: string, data: Record<string, unknown>) => Promise<string>;
    let Hit: any;
    let AssignDamageData: any;

    // Extend CONFIG with wh40k system config (both cases used in codebase)
    namespace CONFIG {
        let wh40k: import('../config.ts').WH40KSystemConfig;
        let WH40K: import('../config.ts').WH40KSystemConfig;
    }
}

export interface WH40KBaseActorDocument extends Actor {
    system: import('../data/abstract/actor-data-model.ts').default;
    items: foundry.utils.Collection<WH40KItem>;
    characteristics: Record<string, WH40KCharacteristic>;
    skills: Record<string, WH40KSkill>;
    initiative: WH40KInitiative;
    wounds: WH40KWounds;
    movement: WH40KMovement;
    rollCharacteristicCheck(characteristic: string): Promise<any>;
    rollWeaponAction(item: WH40KItem): Promise<any>;
    rollPsychicPower(item: WH40KItem): Promise<any>;
    _onItemsChanged(): void;
    getFlag(scope: string, key: string): any;
    setFlag(scope: string, key: string, value: any): Promise<any>;
    update(data: Record<string, any>, options?: Record<string, any>): Promise<any>;
    updateSource(data: Record<string, any>): void;
}

export interface WH40KItemDocument extends Item {
    system: import('../data/abstract/item-data-model.ts').default;
    actor: WH40KBaseActorDocument | null;
    isOriginPath: boolean;
    isNavigatorPower: boolean;
    isShipRole: boolean;
    isCondition: boolean;
    isTalent: boolean;
    isTrait: boolean;
    isAptitude: boolean;
    isMentalDisorder: boolean;
    isMalignancy: boolean;
    isMutation: boolean;
    isSpecialAbility: boolean;
    flags: Record<string, any>;
    getFlag(scope: string, key: string): any;
    setFlag(scope: string, key: string, value: any): Promise<any>;
    update(data: Record<string, any>, options?: Record<string, any>): Promise<any>;
    sendToChat(): Promise<void>;
}

/** Extended render context for WH40K application sheets */
export interface WH40KRenderContext extends Record<string, unknown> {
    tabs?: Record<string, unknown>;
}

export {};
