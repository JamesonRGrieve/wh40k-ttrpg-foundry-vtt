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

// =========================================================================
// WH40K System Namespace on Game
// =========================================================================

interface WH40KGameSystem {
    debug: boolean;
    log: (s: string, o?: unknown) => void;
    warn: (s: string, o?: unknown) => void;
    error: (s: string, o?: unknown) => void;
    rollItemMacro: (...args: unknown[]) => unknown;
    rollSkillMacro: (...args: unknown[]) => unknown;
    rollCharacteristicMacro: (...args: unknown[]) => unknown;
    rollTable: unknown;
    rollPsychicPhenomena: (actor: unknown, mod?: unknown) => unknown;
    rollPerilsOfTheWarp: (actor: unknown) => unknown;
    rollFearEffects: (fear: unknown, dof: unknown) => unknown;
    rollMutation: () => unknown;
    rollMalignancy: () => unknown;
    showRollTableDialog: () => unknown;
    openCompendiumBrowser: (options?: unknown) => unknown;
    OriginPathBuilder: unknown;
    openOriginPathBuilder: (actor: unknown, options?: Record<string, unknown>) => unknown;
    npc: unknown;
    applications: unknown;
    ThreatCalculator: unknown;
    quickCreateNPC: (config?: unknown) => unknown;
    batchCreateNPCs: (config?: unknown) => unknown;
    openEncounterBuilder: () => unknown;
    exportStatBlock: (actor: unknown, format?: unknown) => unknown;
    importStatBlock: (input?: unknown) => unknown;
    openTemplateSelector: (options?: unknown) => unknown;
    DifficultyCalculatorDialog: unknown;
    calculateDifficulty: (actor: unknown) => unknown;
    CombatPresetDialog: unknown;
    savePreset: (actor: unknown) => unknown;
    loadPreset: (actor: unknown) => unknown;
    openPresetLibrary: () => unknown;
    dice: unknown;
    BasicRollWH40K: unknown;
    D100Roll: unknown;
    tooltips?: unknown;
    [key: string]: unknown;
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
        let wh40k: Record<string, unknown>;
        let WH40K: Record<string, unknown>;
        let Actor: Record<string, any>;
        let Item: Record<string, any>;
        let Token: Record<string, any>;
        let TextEditor: Record<string, any>;
        let Dice: Record<string, any>;
        let ux: Record<string, any>;
    }

    // Type ui.notifications so .warn/.info/.error resolve
    interface Notifications {
        warn(message: string, options?: Record<string, unknown>): void;
        info(message: string, options?: Record<string, unknown>): void;
        error(message: string, options?: Record<string, unknown>): void;
    }
    namespace ui {
        let notifications: Notifications;
    }

    // Make foundry.data.fields available as a runtime value for destructuring patterns
    // like `const { StringField, NumberField } = foundry.data.fields;`
    namespace foundry.data {
        const fields: any;
    }
}

/** Extended render context for WH40K application sheets */
interface WH40KRenderContext extends Record<string, any> {
    tabs?: Record<string, any>;
}

export {};
