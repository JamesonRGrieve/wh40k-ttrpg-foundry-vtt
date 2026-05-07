/**
 * @file Intermediate base for career-table-based systems with 3 skill ranks.
 * Used by RT, DH1e, and DW.
 *
 * Costs are looked up from per-career tables. Characters can only
 * purchase advances listed in their career's rank table.
 * Skill ranks: Trained / +10 / +20 (3 levels).
 * Characteristic tiers: Simple / Intermediate / Trained / Expert (4 tiers).
 */

import type { WH40KBaseActor } from '../../documents/base-actor.ts';
import { BaseSystemConfig } from './base-system-config.ts';
import type { SkillRankDef, CharacteristicTierDef, AdvanceCostResult, AdvanceOption } from './types.ts';

export abstract class CareerBasedSystemConfig extends BaseSystemConfig {
    readonly usesAptitudes = false;
    readonly usesCareerTables = true;

    // ── 3-Level Skill Ranks ──────────────────────────────────────

    getSkillRanks(): SkillRankDef[] {
        return [
            { level: 1, key: 'trained', label: 'T', tooltip: 'Trained', bonus: 0 },
            { level: 2, key: 'plus10', label: '+10', tooltip: '+10', bonus: 10 },
            { level: 3, key: 'plus20', label: '+20', tooltip: '+20', bonus: 20 },
        ];
    }

    // ── 4-Tier Characteristic Advancement ────────────────────────

    getCharacteristicTiers(): CharacteristicTierDef[] {
        return [
            { key: 'simple', label: 'WH40K.Advancement.Tier.Simple' },
            { key: 'intermediate', label: 'WH40K.Advancement.Tier.Intermediate' },
            { key: 'trained', label: 'WH40K.Advancement.Tier.Trained' },
            { key: 'expert', label: 'WH40K.Advancement.Tier.Expert' },
        ];
    }

    // ── Career Lookup (abstract — subclasses provide data) ───────

    /** Get the career module registry for this system */
    abstract getCareerRegistry(): Record<string, unknown>;

    /** Resolve the character's career key from actor data */
    abstract resolveCareerKey(actor: WH40KBaseActor): string | null;

    // ── Cost Implementations ─────────────────────────────────────

    getCharacteristicAdvanceCost(actor: WH40KBaseActor, charKey: string, currentTier: number): AdvanceCostResult | null {
        const tiers = this.characteristicTierOrder;
        if (currentTier >= tiers.length) return null;

        const careerKey = this.resolveCareerKey(actor);
        if (!careerKey) return null;

        const career = this.getCareerRegistry()[careerKey] as Record<string, Record<string, Record<string, number>>> | undefined;
        const tierKey = tiers[currentTier]!;
        const cost = career?.['CHARACTERISTIC_COSTS']?.[charKey]?.[tierKey];
        if (cost == null) return null;

        return { cost, tier: tierKey };
    }

    getSkillAdvanceCost(_actor: WH40KBaseActor, _skillKey: string, _currentRank: number): number | null {
        // Career-based: cost is embedded in the AdvanceOption from the career table.
        // The advancement dialog reads cost from the advance entry directly.
        return null;
    }

    getTalentAdvanceCost(_actor: WH40KBaseActor, _talent: unknown): number | null {
        // Same: cost is in the career advance entry.
        return null;
    }

    getAvailableAdvances(actor: WH40KBaseActor): AdvanceOption[] {
        const careerKey = this.resolveCareerKey(actor);
        if (!careerKey) return [];

        const career = this.getCareerRegistry()[careerKey] as Record<string, AdvanceOption[]> | undefined;
        return career?.['RANK_1_ADVANCES'] ?? [];
    }

    // ── RT/DH1e/DW Skill Visibility ─────────────────────────────

    /** Skills available in 3-rank career-based systems (RT, DH1e, DW) */
    getVisibleSkills(): Set<string> {
        return new Set([
            // Standard skills
            'acrobatics',
            'awareness',
            'barter',
            'blather',
            'carouse',
            'charm',
            'chemUse',
            'climb',
            'command',
            'commerce',
            'concealment',
            'contortionist',
            'deceive',
            'demolition',
            'disguise',
            'dodge',
            'evaluate',
            'gamble',
            'inquiry',
            'interrogation',
            'intimidate',
            'invocation',
            'literacy',
            'logic',
            'medicae',
            'psyniscience',
            'scrutiny',
            'search',
            'security',
            'shadowing',
            'silentMove',
            'sleightOfHand',
            'survival',
            'swim',
            'tracking',
            'wrangling',
            // Specialist groups
            'ciphers',
            'commonLore',
            'drive',
            'forbiddenLore',
            'navigation',
            'performer',
            'pilot',
            'scholasticLore',
            'secretTongue',
            'speakLanguage',
            'techUse',
            'trade',
        ]);
    }
}
