/**
 * @file Intermediate base for career-table-based systems with 3 skill ranks.
 * Used by RT, DH1e, and DW.
 *
 * Costs are looked up from per-career tables. Characters can only
 * purchase advances listed in their career's rank table.
 * Skill ranks: Trained / +10 / +20 (3 levels).
 * Characteristic tiers: Simple / Intermediate / Trained / Expert (4 tiers).
 */

import { isStoredRank, rankForExperience } from '../../rules/career-rank.ts';
import { BaseSystemConfig } from './base-system-config.ts';
import type { SkillRankDef, CharacteristicTierDef, AdvanceCostResult, AdvanceOption, SystemConfigActor } from './types.ts';

interface CareerEntry {
    CHARACTERISTIC_COSTS?: { [charKey: string]: { [tier: string]: number | undefined } };
    RANK_1_ADVANCES?: AdvanceOption[];
    /** Every authored rank's advances (operator ruling 2026-11-14: every rank). */
    RANKS?: ReadonlyArray<{ rank: number; branch?: string; title?: string; minXp?: number | null; advances: AdvanceOption[] }>;
}

/** A branch point the actor has reached but not chosen: the rank and the paths it offers. */
export interface CareerBranchChoice {
    rank: number;
    options: Array<{ branch: string; title: string }>;
}

/** The career paths the actor chose, by branch id. */
function actorBranches(actor: SystemConfigActor): readonly string[] {
    const branches = actor.system.careerBranches;
    return Array.isArray(branches) ? branches.filter((branch): branch is string => typeof branch === 'string') : [];
}

export abstract class CareerBasedSystemConfig extends BaseSystemConfig {
    readonly usesAptitudes = false;
    readonly usesCareerTables = true;

    // ── 3-Level Skill Ranks ──────────────────────────────────────

    getSkillRanks(): SkillRankDef[] {
        return [
            { level: 1, key: 'trained', label: 'WH40K.Skills.RankShort.T', tooltip: 'WH40K.Skills.Rank.Trained', bonus: 0 },
            { level: 2, key: 'plus10', label: 'WH40K.Skills.RankShort.Plus10', tooltip: 'WH40K.Skills.Rank.Plus10', bonus: 10 },
            { level: 3, key: 'plus20', label: 'WH40K.Skills.RankShort.Plus20', tooltip: 'WH40K.Skills.Rank.Plus20', bonus: 20 },
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
    // eslint-disable-next-line no-restricted-syntax -- boundary: career module namespaces are opaque; concrete types are structurally CareerEntry but typed as unknown at the registry boundary
    abstract getCareerRegistry(): Record<string, unknown>;

    /** Resolve the character's career key from actor data */
    abstract resolveCareerKey(actor: SystemConfigActor): string | null;

    // ── Cost Implementations ─────────────────────────────────────

    getCharacteristicAdvanceCost(actor: SystemConfigActor, charKey: string, currentTier: number): AdvanceCostResult | null {
        const tiers = this.characteristicTierOrder;
        if (currentTier >= tiers.length) return null;

        const careerKey = this.resolveCareerKey(actor);
        if (careerKey === null || careerKey === '') return null;

        const career = this.getCareerRegistry()[careerKey] as CareerEntry | undefined;
        const tierKey = tiers[currentTier];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess guard: tiers[currentTier] is string | undefined at runtime
        if (tierKey === undefined) return null;
        const cost = career?.CHARACTERISTIC_COSTS?.[charKey]?.[tierKey];
        if (cost === undefined) return null;

        return { cost, tier: tierKey };
    }

    getSkillAdvanceCost(_actor: SystemConfigActor, _skillKey: string, _currentRank: number): number | null {
        // Career-based: cost is embedded in the AdvanceOption from the career table.
        // The advancement dialog reads cost from the advance entry directly.
        return null;
    }

    // eslint-disable-next-line no-restricted-syntax -- boundary: talent type is system-specific; unknown matches base class abstract signature
    getTalentAdvanceCost(_actor: SystemConfigActor, _talent: unknown): number | null {
        // Same: cost is in the career advance entry.
        return null;
    }

    /**
     * The career rank: the GM's override if set; else the highest rank whose printed
     * starting XP the character's total XP has reached (operator ruling 2026-11-16);
     * else, for a career whose tables print no starting XP, the stored rank.
     */
    override effectiveRank(actor: SystemConfigActor): number {
        const { rankOverride } = actor.system;
        if (isStoredRank(rankOverride)) return rankOverride;
        const careerKey = this.resolveCareerKey(actor);
        const career = careerKey === null || careerKey === '' ? undefined : (this.getCareerRegistry()[careerKey] as CareerEntry | undefined);
        const fromExperience = rankForExperience(career?.RANKS ?? [], actor.system.experience?.total ?? 0);
        return fromExperience ?? super.effectiveRank(actor);
    }

    /**
     * The identifiers of the actor's owned origin items on `step` (a DH1 character's
     * elite advances), read off each item: content identifiers can carry a book prefix
     * (`salvation-demagogue`), so a name would not find them.
     */
    protected ownedOriginIdentifiers(actor: SystemConfigActor, step: string): string[] {
        const identifiers: string[] = [];
        // The actor's item collection is typed structurally with `some` only: walk it with that.
        actor.items.some((item) => {
            if (!item.isOriginPath) return false;
            const fields = item.system;
            if ('step' in fields && 'identifier' in fields && fields.step === step && typeof fields.identifier === 'string' && fields.identifier !== '') {
                identifiers.push(fields.identifier);
            }
            return false;
        });
        return identifiers;
    }

    /**
     * The registry keys whose tables the actor buys advances from: its career. A line
     * whose character also buys from another origin overrides this (DW: speciality
     * and Chapter).
     */
    resolveAdvanceSourceKeys(actor: SystemConfigActor): string[] {
        const careerKey = this.resolveCareerKey(actor);
        return careerKey === null || careerKey === '' ? [] : [careerKey];
    }

    getAvailableAdvances(actor: SystemConfigActor): AdvanceOption[] {
        const rank = this.effectiveRank(actor);
        const chosen = actorBranches(actor);
        return this.resolveAdvanceSourceKeys(actor).flatMap((key) => {
            const career = this.getCareerRegistry()[key] as CareerEntry | undefined;
            const ranks = career?.RANKS ?? [];
            // A table with authored ranks offers every advance up to the actor's rank;
            // one with only a rank-1 list offers that.
            if (ranks.length === 0) return career?.RANK_1_ADVANCES ?? [];
            // A branched rank offers its advances only on the path the character chose.
            return ranks
                .filter((entry) => entry.rank <= rank && (entry.branch === undefined || entry.branch === '' || chosen.includes(entry.branch)))
                .flatMap((entry) => entry.advances);
        });
    }

    /**
     * The first branch point the actor has reached without choosing a path: the
     * lowest rank up to its own whose entries are branches, none of them chosen.
     * Null when there is none (or the career doesn't branch).
     */
    pendingCareerBranch(actor: SystemConfigActor): CareerBranchChoice | null {
        const careerKey = this.resolveCareerKey(actor);
        if (careerKey === null || careerKey === '') return null;
        const career = this.getCareerRegistry()[careerKey] as CareerEntry | undefined;
        const rank = this.effectiveRank(actor);
        const chosen = actorBranches(actor);
        const branched = (career?.RANKS ?? []).filter((entry) => entry.rank <= rank && entry.branch !== undefined && entry.branch !== '');
        const ranksWithChoice = [...new Set(branched.map((entry) => entry.rank))].sort((a, b) => a - b);
        for (const atRank of ranksWithChoice) {
            const options = branched.filter((entry) => entry.rank === atRank);
            if (options.some((entry) => chosen.includes(entry.branch ?? ''))) continue;
            return { rank: atRank, options: options.map((entry) => ({ branch: entry.branch ?? '', title: entry.title ?? entry.branch ?? '' })) };
        }
        return null;
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
