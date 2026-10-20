/**
 * @file System configuration registry.
 * Provides type-safe access to per-system configuration via singleton instances.
 */

import type { AcquisitionLadder } from '../../rules/acquisition-ladder.ts';
import type { BurstActionCost, BurstActionRule, BurstCapRules, BurstMode } from '../../rules/auto-fire.ts';
import type { EvasionRules } from '../../rules/evasion.ts';
import type { GrappleRules } from '../../rules/grapple.ts';
import type { InquestRules } from '../../rules/inquest.ts';
import type { ItemRepairRules } from '../../rules/item-repair.ts';
import type { ComradeRules } from '../../rules/ow-comrade.ts';
import type { ComradeOrderDef } from '../../rules/ow-orders.ts';
import type { VehicleDrivingRules } from '../../rules/vehicle-trait-tests.ts';
import type { WeaponModificationRules } from '../../rules/weapon-modification.ts';
import type { BaseSystemConfig } from './base-system-config.ts';
import { BCSystemConfig } from './bc-config.ts';
import { DH1eSystemConfig } from './dh1-config.ts';
import { DH2eSystemConfig } from './dh2-config.ts';
import { DWSystemConfig } from './dw-config.ts';
import { IMSystemConfig } from './im-config.ts';
import { OWSystemConfig } from './ow-config.ts';
import { RTSystemConfig } from './rt-config.ts';
import type { GameSystemId, SystemThemeRole } from './types.ts';

/** Singleton instances, one per game system */
const SYSTEM_CONFIGS: Record<GameSystemId, BaseSystemConfig> = {
    rt: new RTSystemConfig(),
    dh1: new DH1eSystemConfig(),
    dh2: new DH2eSystemConfig(),
    bc: new BCSystemConfig(),
    ow: new OWSystemConfig(),
    dw: new DWSystemConfig(),
    im: new IMSystemConfig(),
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
        return SYSTEM_CONFIGS[id];
    },

    /** Get a system config by ID, or null if unknown */
    getOrNull(id: string): BaseSystemConfig | null {
        if (!(id in SYSTEM_CONFIGS)) return null;
        return SYSTEM_CONFIGS[id as GameSystemId];
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

/**
 * A line's acquisition ladder (#192), or `null` for an unknown line or one with
 * no availability-modified acquisition test.
 * @param line  `system.gameSystem` id.
 */
export function acquisitionLadderFor(line: string | undefined): AcquisitionLadder | null {
    if (line === undefined) return null;
    return SystemConfigRegistry.getOrNull(line)?.acquisitionLadder ?? null;
}

/**
 * A line's Inquest tables (#90), or `null` for an unknown line or one that
 * prints no Inquest rules (every line but DH2).
 * @param line  `system.gameSystem` id.
 */
export function inquestRulesFor(line: string | undefined): InquestRules | null {
    if (line === undefined) return null;
    return SystemConfigRegistry.getOrNull(line)?.inquestRules ?? null;
}

/**
 * A line's item-repair rule (#444/#136), or `null` for an unknown line or one
 * whose book leaves the Tech-Use repair difficulty to the GM.
 * @param line  `system.gameSystem` id.
 */
export function itemRepairRulesFor(line: string | undefined): ItemRepairRules | null {
    if (line === undefined) return null;
    return SystemConfigRegistry.getOrNull(line)?.itemRepair ?? null;
}

/**
 * The skill a line's driver tests for each means of locomotion (content#28), or
 * `null` for an unknown line or one whose driving skills are not modelled.
 * @param line  `system.gameSystem` id.
 */
export function vehicleDrivingRulesFor(line: string | undefined): VehicleDrivingRules | null {
    if (line === undefined) return null;
    return SystemConfigRegistry.getOrNull(line)?.vehicleDriving ?? null;
}

/**
 * A line's personal weapon-modification rule (#136), or `null` for an unknown
 * line or one that prints no fitting test.
 * @param line  `system.gameSystem` id.
 */
export function weaponModificationRulesFor(line: string | undefined): WeaponModificationRules | null {
    if (line === undefined) return null;
    return SystemConfigRegistry.getOrNull(line)?.weaponModification ?? null;
}

/**
 * A line's printed burst ceiling (#607), or `null` for an unknown line or one
 * that prints no rate-of-fire bursts.
 * @param line  `system.gameSystem` id.
 */
export function burstRulesFor(line: string | undefined): BurstCapRules | null {
    if (line === undefined) return null;
    return SystemConfigRegistry.getOrNull(line)?.burstRules ?? null;
}

/** The line whose burst modifiers an unresolved line reads — DH2, the family's canonical default. */
const DEFAULT_BURST_LINE = 'dh2';

/**
 * A burst action's printed to-hit modifier in a line (#607). An unresolved line
 * (no rolling actor, or an id no config registers) reads DH2's; a line that
 * prints no bursts (IM) contributes 0.
 * @param line  `system.gameSystem` id.
 * @param mode  The burst whose modifier is wanted.
 */
export function burstAttackModifierFor(line: string | undefined, mode: BurstMode): number {
    return burstActionRuleFor(line, mode)?.attackModifier ?? 0;
}

/**
 * The action a burst costs in a line (#607): Half in DH2 / BC / OW, Full in DH1 /
 * DW / RT. An unresolved line reads DH2's; a line that prints no bursts has none.
 * @param line  `system.gameSystem` id.
 * @param mode  The burst whose cost is wanted.
 */
export function burstActionCostFor(line: string | undefined, mode: BurstMode): BurstActionCost | null {
    return burstActionRuleFor(line, mode)?.actionCost ?? null;
}

/** A line's printed rule for one burst, DH2's for an unresolved line, null where the line prints no bursts. */
function burstActionRuleFor(line: string | undefined, mode: BurstMode): BurstActionRule | null {
    const config = SystemConfigRegistry.getOrNull(line ?? DEFAULT_BURST_LINE) ?? SystemConfigRegistry.getOrNull(DEFAULT_BURST_LINE);
    return config?.burstActions?.[mode] ?? null;
}

/**
 * A line's printed evasion rule for multi-hit attacks (#414), or `null` for an
 * unknown line or one modelled only as the single negated hit.
 * @param line  `system.gameSystem` id.
 */
export function evasionRulesFor(line: string | undefined): EvasionRules | null {
    if (line === undefined) return null;
    return SystemConfigRegistry.getOrNull(line)?.evasionRules ?? null;
}

/**
 * A line's printed Grapple action (#120), or `null` for an unknown line or one
 * whose grapple the panel does not model.
 * @param line  `system.gameSystem` id.
 */
export function grappleRulesFor(line: string | undefined): GrappleRules | null {
    if (line === undefined) return null;
    return SystemConfigRegistry.getOrNull(line)?.grappleRules ?? null;
}

/**
 * A line's printed Comrades in Combat rules (#152), or `null` for an unknown line
 * or one without Comrades.
 * @param line  `system.gameSystem` id.
 */
export function comradeRulesFor(line: string | undefined): ComradeRules | null {
    if (line === undefined) return null;
    return SystemConfigRegistry.getOrNull(line)?.comradeRules ?? null;
}

/**
 * The Orders a line's PCs can give their Comrade (#152); empty for an unknown line
 * or one without Comrades.
 * @param line  `system.gameSystem` id.
 */
export function comradeOrdersFor(line: string | undefined): readonly ComradeOrderDef[] {
    if (line === undefined) return [];
    return SystemConfigRegistry.getOrNull(line)?.comradeOrders ?? [];
}

/**
 * Tailwind utility prefixes for each `SystemThemeRole`.
 * Extend this map when a new role becomes useful (e.g. ring/divider/text).
 */
const ROLE_PREFIX: Record<SystemThemeRole, string> = {
    primary: 'tw-bg-',
    accent: 'tw-text-',
    chatAccent: 'tw-text-',
    border: 'tw-border-',
};

/**
 * Resolve a per-system theme role into a concrete Tailwind utility class.
 *
 * Used by Handlebars helpers and TS sheet code so templates ask for a
 * semantic role (`'border'`, `'accent'`) rather than naming a specific
 * color, and palette changes happen in one place
 * (`<id>-config.ts` `theme` block).
 *
 * @example
 *   themeClassFor('dh2', 'border')  // → 'tw-border-gold-raw-d10'
 *   themeClassFor('rt', 'primary')   // → 'tw-bg-void-l20'
 */
export function themeClassFor(systemId: GameSystemId, role: SystemThemeRole): string {
    const config = SystemConfigRegistry.get(systemId);
    return `${ROLE_PREFIX[role]}${config.theme[role]}`;
}

// Re-exports
export { BaseSystemConfig } from './base-system-config.ts';
export type { GameSystemId, FatePointUseDef, SystemThemeRole } from './types.ts';
