/**
 * @file Intermediate base for aptitude-based systems with 4 skill ranks.
 * Used by DH2e, OW, and BC.
 *
 * Any skill/talent can be advanced. Costs depend on how many of the advance's
 * 2 aptitudes the character shares: 2 matching = cheapest, 0 = most expensive.
 * Skill ranks: Known / Trained / Experienced / Veteran (4 levels).
 * Characteristic tiers: Simple / Intermediate / Trained / Proficient / Expert (5 tiers).
 */

import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import { BaseSystemConfig } from './base-system-config.ts';
import type { SkillRankDef, CharacteristicTierDef, AdvanceCostResult, AdvanceOption } from './types.ts';

export abstract class AptitudeBasedSystemConfig extends BaseSystemConfig {
    readonly usesAptitudes = true;
    readonly usesCareerTables = false;

    // ── 4-Level Skill Ranks ──────────────────────────────────────

    getSkillRanks(): SkillRankDef[] {
        return [
            { level: 1, key: 'trained', label: 'Kn', tooltip: 'Known', bonus: 0 },
            { level: 2, key: 'plus10', label: 'Tr', tooltip: 'Trained', bonus: 10 },
            { level: 3, key: 'plus20', label: 'Ex', tooltip: 'Experienced', bonus: 20 },
            { level: 4, key: 'plus30', label: 'Ve', tooltip: 'Veteran', bonus: 30 },
        ];
    }

    // ── 5-Tier Characteristic Advancement ────────────────────────

    getCharacteristicTiers(): CharacteristicTierDef[] {
        return [
            { key: 'simple', label: 'WH40K.Advancement.Tier.Simple' },
            { key: 'intermediate', label: 'WH40K.Advancement.Tier.Intermediate' },
            { key: 'trained', label: 'WH40K.Advancement.Tier.Trained' },
            { key: 'proficient', label: 'WH40K.Advancement.Tier.Proficient' },
            { key: 'expert', label: 'WH40K.Advancement.Tier.Expert' },
        ];
    }

    // ── Cost Tables ──────────────────────────────────────────────

    /**
     * Skill advance cost table: [matchingAptitudes][rankIndex].
     * Default is DH2e Table 2-4. Subclasses can override.
     */
    getSkillCostTable(): Record<number, number[]> {
        return {
            2: [100, 200, 300, 400],
            1: [200, 400, 600, 800],
            0: [300, 600, 900, 1200],
        };
    }

    /**
     * Characteristic advance cost table: [matchingAptitudes][tierIndex].
     * Default is DH2e Table 2-2. Subclasses can override.
     */
    getCharacteristicCostTable(): Record<number, number[]> {
        return {
            2: [100, 250, 500, 750, 1250],
            1: [250, 500, 750, 1000, 1500],
            0: [500, 750, 1000, 1500, 2500],
        };
    }

    /**
     * Talent advance cost table: [matchingAptitudes] at each tier.
     * Default is DH2e Table 2-6. Subclasses can override.
     */
    getTalentCostTable(): Record<number, Record<number, number>> {
        return {
            1: { 2: 200, 1: 300, 0: 600 },
            2: { 2: 300, 1: 450, 0: 900 },
            3: { 2: 400, 1: 600, 0: 1200 },
        };
    }

    // ── Aptitude Resolution ──────────────────────────────────────

    /**
     * Get the 2 aptitudes associated with a characteristic.
     * Subclasses provide system-specific pairings.
     */
    abstract getCharacteristicAptitudes(charKey: string): [string, string];

    /**
     * Get the 2 aptitudes associated with a skill.
     * Default implementation reads from a skill aptitude table.
     * Subclasses can override if their table differs.
     */
    getSkillAptitudes(skillKey: string): [string, string] {
        return this.getSkillAptitudeTable()[skillKey] ?? ['General', 'General'];
    }

    /**
     * Skill aptitude table. Subclasses provide system-specific mappings.
     * Keys are schema skill keys (camelCase).
     */
    abstract getSkillAptitudeTable(): Record<string, [string, string]>;

    /**
     * Collect all aptitudes the character possesses.
     * Reads from the actor's aptitudes array (populated from origin path items at runtime).
     */
    getCharacterAptitudes(actor: WH40KBaseActor): string[] {
        const apts = actor.system?.aptitudes ?? [];
        return Array.isArray(apts) ? apts : [...apts];
    }

    /**
     * Count how many of the advance's aptitudes the character shares (0, 1, or 2).
     */
    countMatchingAptitudes(characterAptitudes: string[], advanceAptitudes: string[]): number {
        const charSet = new Set(characterAptitudes.map((a) => a.toLowerCase()));
        return advanceAptitudes.filter((a) => charSet.has(a.toLowerCase())).length;
    }

    /**
     * Compute match metadata for an advance's aptitudes. Used by the advancement
     * dialog to render 2/1/0 indicator dots and show which aptitudes matched.
     */
    getAdvanceMatchInfo(actor: WH40KBaseActor, advanceAptitudes: string[]): { matches: number; matched: string[]; unmatched: string[]; all: string[] } {
        const characterAptitudes = this.getCharacterAptitudes(actor);
        const charSet = new Set(characterAptitudes.map((a) => a.toLowerCase()));
        const matched: string[] = [];
        const unmatched: string[] = [];
        for (const apt of advanceAptitudes) {
            if (charSet.has(apt.toLowerCase())) matched.push(apt);
            else unmatched.push(apt);
        }
        return { matches: matched.length, matched, unmatched, all: [...advanceAptitudes] };
    }

    // ── Cost Implementations ─────────────────────────────────────

    getCharacteristicAdvanceCost(actor: WH40KBaseActor, charKey: string, currentTier: number): AdvanceCostResult | null {
        const tiers = this.characteristicTierOrder;
        if (currentTier >= tiers.length) return null;

        const charAptitudes = this.getCharacterAptitudes(actor);
        const advAptitudes = this.getCharacteristicAptitudes(charKey);
        const matches = this.countMatchingAptitudes(charAptitudes, advAptitudes);

        const cost = this.getCharacteristicCostTable()[matches]?.[currentTier];
        if (cost == null) return null;

        return { cost, tier: tiers[currentTier] };
    }

    getSkillAdvanceCost(actor: WH40KBaseActor, skillKey: string, currentRank: number, context?: Record<string, unknown>): number | null {
        if (currentRank >= this.skillRankCount) return null;

        const charAptitudes = this.getCharacterAptitudes(actor);
        const advAptitudes = (context?.advanceAptitudes as string[]) ?? this.getSkillAptitudes(skillKey);
        const matches = this.countMatchingAptitudes(charAptitudes, advAptitudes);

        return this.getSkillCostTable()[matches]?.[currentRank] ?? null;
    }

    getTalentAdvanceCost(actor: WH40KBaseActor, talent: unknown, context?: Record<string, unknown>): number | null {
        const charAptitudes = this.getCharacterAptitudes(actor);
        const talentRecord = talent as Record<string, Record<string, unknown>>;
        const advAptitudes = (context?.advanceAptitudes as string[]) ?? (talentRecord.system?.aptitudes as string[] | undefined) ?? [];
        const matches = this.countMatchingAptitudes(charAptitudes, advAptitudes);

        const tier = (talentRecord.system?.tier as number | undefined) ?? 1;
        return this.getTalentCostTable()[tier]?.[matches] ?? null;
    }

    getAvailableAdvances(_actor: WH40KBaseActor): AdvanceOption[] {
        // Aptitude-based: all skills/talents available. The advancement dialog
        // queries compendiums and computes costs dynamically.
        return [];
    }

    // ── DH2e/BC/OW Skill Visibility ─────────────────────────────

    /** Skills available in 4-rank aptitude-based systems (DH2e, BC, OW) */
    getVisibleSkills(): Set<string> {
        return new Set([
            // Standard skills
            'acrobatics',
            'athletics',
            'awareness',
            'charm',
            'command',
            'commerce',
            'deceive',
            'dodge',
            'inquiry',
            'interrogation',
            'intimidate',
            'logic',
            'medicae',
            'parry',
            'psyniscience',
            'scrutiny',
            'security',
            'sleightOfHand',
            'stealth',
            'survival',
            'techUse',
            // Specialist groups
            'commonLore',
            'forbiddenLore',
            'linguistics',
            'navigate',
            'operate',
            'scholasticLore',
            'trade',
        ]);
    }
}
