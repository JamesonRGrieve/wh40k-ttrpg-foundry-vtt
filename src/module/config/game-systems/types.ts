/**
 * @file Type definitions for the game system configuration hierarchy.
 * All WH40K RPG game lines share these interfaces.
 */

/** Canonical game system identifiers */
export type GameSystemId = 'rt' | 'dh1e' | 'dh2e' | 'bc' | 'ow' | 'dw' | 'im';

/** Skill rank definition for display and computation */
export interface SkillRankDef {
    /** 1-based ordinal (1 = first rank, 4 = highest for DH2e/BC/OW) */
    level: number;
    /** Data field key for backward compat: 'trained', 'plus10', 'plus20', 'plus30' */
    key: string;
    /** Short display label: 'T', '+10', 'Kn', 'Tr', etc. */
    label: string;
    /** Full name: 'Trained', 'Known', 'Experienced', etc. */
    tooltip: string;
    /** Test bonus at this rank: 0, 10, 20, 30 */
    bonus: number;
}

/** Characteristic advancement tier definition */
export interface CharacteristicTierDef {
    /** Tier key: 'simple', 'intermediate', 'trained', 'proficient', 'expert' */
    key: string;
    /** Localization key for display */
    label: string;
}

/** Origin path step definition */
export interface OriginStepDef {
    /** Step key: 'homeWorld', 'birthright', 'race', 'regiment', etc. */
    key: string;
    /** Origin path data model step field value (same as key) */
    step: string;
    /** FontAwesome icon class */
    icon: string;
    /** Localization key suffix for description */
    descKey: string;
    /** 1-based display order in the builder */
    stepIndex: number;
}

/** Full origin step configuration for a game system */
export interface OriginStepConfig {
    coreSteps: OriginStepDef[];
    optionalStep: OriginStepDef | null;
    packs: string[];
    /** Optional "Equip Acolyte" step (DH2e Stage 4) for selecting starting gear. */
    equipmentStep?: OriginStepDef | null;
    /** Compendium packs to browse for the equipment step (Item packs). */
    equipmentPacks?: string[];
}

/** Result of computing an advancement cost */
export interface AdvanceCostResult {
    /** XP cost */
    cost: number;
    /** Tier key for display */
    tier: string;
    /** Resolved localized label (optional) */
    tierLabel?: string;
}

/** A single advance offering (skill, talent, or characteristic) */
export interface AdvanceOption {
    name: string;
    cost: number;
    type: 'skill' | 'talent';
    specialization?: string;
    prerequisites?: Prerequisite[];
}

/** Prerequisite structure */
export interface Prerequisite {
    type: 'characteristic' | 'skill' | 'talent';
    key: string;
    value?: number;
}

/** Chaos alignment values for Black Crusade */
export type ChaosAlignment = 'khorne' | 'nurgle' | 'slaanesh' | 'tzeentch' | 'unaligned';
