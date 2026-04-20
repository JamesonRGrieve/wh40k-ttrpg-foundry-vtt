/* eslint-disable @typescript-eslint/no-unused-vars -- ambient type declarations for consumer use */
/**
 * Global type declarations for the WH40K RPG Foundry VTT System.
 * Augments Foundry VTT types with system-specific extensions.
 */

// =========================================================================
// WH40K System Types
// =========================================================================

/** Characteristic data structure */
interface WH40KCharacteristic {
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
interface WH40KSkill {
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
interface WH40KSkillEntry {
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
interface WH40KWounds {
    value: number;
    max: number;
    critical: number;
}

/** Fate data structure */
interface WH40KFate {
    value: number;
    max: number;
    total?: number;
    rolled?: boolean;
}

/** Initiative data structure */
interface WH40KInitiative {
    base: number;
    bonus: number;
    characteristic?: string;
}

/** Movement data structure */
interface WH40KMovement {
    half: number;
    full: number;
    charge: number;
    run: number;
}

/** Modifier breakdown entry */
interface WH40KModifierEntry {
    source: string;
    value: number;
    uuid?: string;
    icon: string;
}

/** Stat breakdown result */
interface WH40KStatBreakdown {
    label: string;
    base: number;
    modifiers: WH40KModifierEntry[];
    total: number;
}

/** Description object structure */
interface WH40KDescription {
    value: string;
    chat: string;
    summary: string;
}

/** Source reference structure */
interface WH40KSourceReference {
    book: string;
    page: string;
    custom: string;
}

/** Roll configuration for talents */
interface WH40KRollConfig {
    characteristic?: string;
    modifier?: number;
    description?: string;
}

/** Item modifiers structure */
interface WH40KItemModifiers {
    characteristics?: Record<string, number>;
    skills?: Record<string, number>;
    other?: Array<{ key: string; value: number }>;
    wounds?: number;
    fate?: number;
    talents?: string[];
}

/** Armour location data */
interface WH40KArmourLocation {
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

interface WH40KGameSystem {
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
    transaction: typeof TransactionManager;
    dice: typeof dice;
    BasicRollWH40K: typeof dice.BasicRollWH40K;
    D100Roll: typeof dice.D100Roll;
    tooltips?: unknown;
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

    // Augment ReadyGame to include wh40k
    interface ReadyGame {
        wh40k: WH40KGameSystem;
    }

    // Extend CONFIG with wh40k system config (both cases used in codebase)
    namespace CONFIG {
        let wh40k: import('../config.ts').WH40KSystemConfig;
        let WH40K: import('../config.ts').WH40KSystemConfig;
    }
}

/** Extended render context for WH40K application sheets */
interface WH40KRenderContext extends Record<string, unknown> {
    tabs?: Record<string, unknown>;
}

export {};
