/**
 * @file System configuration registry.
 * Provides type-safe access to per-system configuration via singleton instances.
 */

import { BaseSystemConfig } from './base-system-config.ts';
import { RTSystemConfig } from './rt-config.ts';
import { DH1eSystemConfig } from './dh1e-config.ts';
import { DH2eSystemConfig } from './dh2e-config.ts';
import { BCSystemConfig } from './bc-config.ts';
import { OWSystemConfig } from './ow-config.ts';
import { DWSystemConfig } from './dw-config.ts';
import type { GameSystemId } from './types.ts';

/** Singleton instances, one per game system */
const SYSTEM_CONFIGS: Record<GameSystemId, BaseSystemConfig> = {
    rt:   new RTSystemConfig(),
    dh1e: new DH1eSystemConfig(),
    dh2e: new DH2eSystemConfig(),
    bc:   new BCSystemConfig(),
    ow:   new OWSystemConfig(),
    dw:   new DWSystemConfig(),
};

/**
 * System config registry.
 * Entry point for all system-specific behavior.
 */
export const SystemConfigRegistry = {
    /**
     * Get a system config by ID.
     * @throws If the ID is unknown
     */
    get(id: GameSystemId): BaseSystemConfig {
        const config = SYSTEM_CONFIGS[id];
        if (!config) throw new Error(`Unknown game system: ${id}`);
        return config;
    },

    /** Get a system config by ID, or null if unknown */
    getOrNull(id: string): BaseSystemConfig | null {
        return SYSTEM_CONFIGS[id as GameSystemId] ?? null;
    },

    /** Get all registered system configs */
    getAll(): BaseSystemConfig[] {
        return Object.values(SYSTEM_CONFIGS);
    },

    /** Get all system IDs */
    getIds(): GameSystemId[] {
        return Object.keys(SYSTEM_CONFIGS) as GameSystemId[];
    },

    /** Check if a system ID is registered */
    has(id: string): boolean {
        return id in SYSTEM_CONFIGS;
    },
} as const;

// Re-exports
export { BaseSystemConfig } from './base-system-config.ts';
export { CareerBasedSystemConfig } from './career-based-system-config.ts';
export { AptitudeBasedSystemConfig } from './aptitude-based-system-config.ts';
export type {
    GameSystemId, SkillRankDef, CharacteristicTierDef, OriginStepDef,
    OriginStepConfig, AdvanceCostResult, AdvanceOption, Prerequisite,
    ChaosAlignment,
} from './types.ts';
