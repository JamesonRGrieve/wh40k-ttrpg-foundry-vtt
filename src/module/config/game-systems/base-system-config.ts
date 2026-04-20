/**
 * @file Abstract base class for game system configurations.
 * Each WH40K RPG game line provides a concrete subclass.
 */

import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import type { GameSystemId, SkillRankDef, CharacteristicTierDef, OriginStepConfig, AdvanceCostResult, AdvanceOption } from './types.ts';

export abstract class BaseSystemConfig {
    /** Canonical system identifier */
    abstract readonly id: GameSystemId;

    /** Human-readable system name (localization key) */
    abstract readonly label: string;

    /** CSS class applied to system-specific sheets */
    abstract readonly cssClass: string;

    /** Whether this system uses aptitude-based cost calculations */
    abstract readonly usesAptitudes: boolean;

    /** Whether this system uses career-based advance tables */
    abstract readonly usesCareerTables: boolean;

    // ── Starting Resources ────────────────────────────────────────

    /** Starting XP for a new character in this system */
    get startingXP(): number {
        return 0;
    }

    // ── Skill Ranks ──────────────────────────────────────────────

    /** Ordered skill rank definitions for this system */
    abstract getSkillRanks(): SkillRankDef[];

    /** Maximum skill rank (3 for RT/DH1e/DW, 4 for DH2e/BC/OW) */
    get skillRankCount(): number {
        return this.getSkillRanks().length;
    }

    // ── Characteristic Tiers ─────────────────────────────────────

    /** Ordered characteristic advancement tier definitions */
    abstract getCharacteristicTiers(): CharacteristicTierDef[];

    /** Tier key array (convenience) */
    get characteristicTierOrder(): string[] {
        return this.getCharacteristicTiers().map((t) => t.key);
    }

    // ── Origin Path ──────────────────────────────────────────────

    /** Origin path step configuration for this system */
    abstract getOriginStepConfig(): OriginStepConfig;

    // ── Advancement Costs ────────────────────────────────────────

    /**
     * Compute the XP cost for the next characteristic advance.
     * @param actor       The character actor
     * @param charKey     Characteristic key (e.g. 'fellowship')
     * @param currentTier Number of advances already purchased (0-based)
     * @returns Cost result, or null if maxed
     */
    abstract getCharacteristicAdvanceCost(actor: WH40KBaseActor, charKey: string, currentTier: number): AdvanceCostResult | null;

    /**
     * Compute the XP cost for advancing a skill to its next rank.
     * @param actor       The character actor
     * @param skillKey    Skill system key
     * @param currentRank Current skill rank (0 = untrained)
     * @param context     Optional system-specific context
     * @returns Cost in XP, or null if not advanceable
     */
    abstract getSkillAdvanceCost(actor: WH40KBaseActor, skillKey: string, currentRank: number, context?: Record<string, unknown>): number | null;

    /**
     * Compute the XP cost for acquiring a talent.
     * @param actor   The character actor
     * @param talent  Talent data (with aptitudes, tier, etc.)
     * @param context Optional system-specific context
     * @returns Cost in XP, or null if not available
     */
    abstract getTalentAdvanceCost(actor: WH40KBaseActor, talent: unknown, context?: Record<string, unknown>): number | null;

    /**
     * Get the list of advances available to a character.
     * Career-based systems return a career-filtered list.
     * Aptitude-based systems return empty (all skills/talents available, costs computed dynamically).
     */
    abstract getAvailableAdvances(actor: WH40KBaseActor): AdvanceOption[];

    // ── Skill Visibility ─────────────────────────────────────────

    /**
     * Get the set of skill keys visible for this game system.
     * Skills not in this set are hidden on the character sheet.
     * The schema contains all skills from all systems; this filters to the relevant ones.
     */
    abstract getVisibleSkills(): Set<string>;

    // ── UI Labels ─────────────────────────────────────────────────

    /**
     * Short labels for step navigation buttons.
     * Default implementation uses i18n keys: WH40K.OriginPath.Short.{StepKey}
     * Override in subclasses only if the i18n keys are insufficient.
     */
    getStepShortLabels(): Record<string, string> {
        const config = this.getOriginStepConfig();
        const labels: Record<string, string> = {};
        const allSteps = [...config.coreSteps];
        if (config.optionalStep) allSteps.push(config.optionalStep);
        if (config.equipmentStep) allSteps.push(config.equipmentStep);

        for (const step of allSteps) {
            const key = `WH40K.OriginPath.Short.${step.key}`;
            const localized = game.i18n.localize(key);
            labels[step.key] = localized !== key ? localized : step.key;
        }
        return labels;
    }

    // ── Skill Level Mapping ──────────────────────────────────────

    /**
     * Map an origin path skill level string to a numeric rank.
     * Handles both RT ('trained','plus10','plus20') and
     * DH2e ('known','trained','experienced','veteran') terminology.
     */
    static skillLevelToRank(level: string): number {
        const map: Record<string, number> = {
            known: 1,
            trained: 1,
            plus10: 2,
            experienced: 3,
            plus20: 3,
            veteran: 4,
            plus30: 4,
        };
        return map[level] ?? 0;
    }
}
