/**
 * Pure NPC-advancement math — the bridge that turns a printed NPC stat block into
 * a *buildable* character (#503).
 *
 * DH2 (and the rest of the aptitude family) prints an NPC as a frozen stat block:
 * flat characteristics, a comma-separated skills line, a talents line. A PC by
 * contrast is a ledger of purchased advances priced against aptitudes. This module
 * reconciles the two so an NPC can be advanced through the normal Advancement
 * Dialog: it splits each printed characteristic into `base + advance × 5`, derives
 * the aptitude set the stat block implies, and prices every advancement
 * (skill / talent / characteristic / psychic) to produce the exact XP an equivalent
 * PC build would have cost.
 *
 * Everything here is pure and Foundry-free so it is directly unit-testable; the
 * DataModel calls in and supplies the live cost tables from the line's
 * `AptitudeBasedSystemConfig`. The whole layer is gated behind the
 * `npcAdvancement` world setting — with it off nothing here runs and NPCs stay
 * flat stat blocks.
 *
 * These are content-agnostic mechanics (pure arithmetic over tables the config
 * owns), not per-item content values, so they live in `src/module/rules/` rather
 * than a compendium — the same rationale as `xp-costs.ts`.
 */

import { psyRatingTotalCost, psychicPowerCost } from './xp-costs.ts';

/** DH2 characteristic advances move in fixed +5 steps. */
export const CHARACTERISTIC_STEP = 5;

/** DH2 caps characteristic advancement at five tiers (Simple … Elite). */
export const MAX_CHARACTERISTIC_ADVANCES = 5;

/** Skill rank ceiling: 0 untrained, 1 known, 2 (+10), 3 (+20), 4 (+30). */
export const MAX_SKILL_RANK = 4;

/**
 * Nominal unadvanced human characteristic. DH2 rolls starting characteristics as
 * 2d10+20 (mean 31), so 30 is the round baseline an NPC's printed value is
 * measured against. A printed value at or below this carries zero advances and
 * therefore costs nothing.
 *
 * RAW never states a starting value for an NPC, so this split is an explicit
 * documented convention rather than rules-as-written — see `src/packs/CLAUDE.md`
 * → *NPC Advancement*. It is defined exactly once, here, so it can be retuned in
 * one place instead of being re-derived per actor.
 */
export const NPC_CHARACTERISTIC_BASELINE = 30;

/**
 * The rank-bearing fields {@link skillRankFrom} reads. Every field is optional so
 * both a full trained-skill entry and a specialization row (whose derived flags may
 * not be populated yet) satisfy it without a cast.
 */
export interface SkillRankSource {
    /** Authored rank 0–4 — the source of truth when present and > 0. */
    advance?: number | undefined;
    trained?: boolean | undefined;
    plus10?: boolean | undefined;
    plus20?: boolean | undefined;
    plus30?: boolean | undefined;
}

/**
 * Effective rank of a trained-skill entry.
 *
 * `advance` is the authored source of truth. Legacy entries (and anything the prose
 * importer produced before the advancement shape existed) carry only the cumulative
 * boolean flags, so fall back to counting those — which keeps every un-migrated NPC
 * resolving exactly as before.
 */
export function skillRankFrom(skill: SkillRankSource | undefined): number {
    if (skill === undefined) return 0;
    if (typeof skill.advance === 'number' && skill.advance > 0) {
        return Math.min(skill.advance, MAX_SKILL_RANK);
    }
    let rank = skill.trained === true ? 1 : 0;
    if (skill.plus10 === true) rank += 1;
    if (skill.plus20 === true) rank += 1;
    if (skill.plus30 === true) rank += 1;
    return Math.min(rank, MAX_SKILL_RANK);
}

/** The cumulative boolean mirrors of an effective rank. */
export function rankFlags(rank: number): { trained: boolean; plus10: boolean; plus20: boolean; plus30: boolean } {
    return { trained: rank >= 1, plus10: rank >= 2, plus20: rank >= 3, plus30: rank >= 4 };
}

/** A printed characteristic split into its unadvanced base and purchased advances. */
export interface CharacteristicSplit {
    /** Unadvanced value: `printed − advance × CHARACTERISTIC_STEP`. */
    base: number;
    /** Number of +5 advances purchased, clamped to `[0, MAX_CHARACTERISTIC_ADVANCES]`. */
    advance: number;
}

/**
 * Split a printed NPC characteristic into `{ base, advance }` under the baseline
 * convention above. The advance count is floored (a value between steps keeps the
 * remainder in `base`, never rounds up into an advance the NPC did not pay for)
 * and clamped, so `base + advance × 5` always reconstructs `printed` exactly.
 */
export function splitCharacteristic(printed: number, baseline: number = NPC_CHARACTERISTIC_BASELINE): CharacteristicSplit {
    if (!Number.isFinite(printed)) return { base: 0, advance: 0 };
    const raw = Math.floor((printed - baseline) / CHARACTERISTIC_STEP);
    const advance = Math.min(Math.max(raw, 0), MAX_CHARACTERISTIC_ADVANCES);
    return { base: printed - advance * CHARACTERISTIC_STEP, advance };
}

/**
 * Sum a cost ladder cumulatively: reaching rank/tier `steps` costs every step up
 * to it, exactly as a player pays climbing the ladder — not just the final step.
 * Steps beyond the row's length contribute nothing (a malformed or short table
 * degrades to "free" rather than throwing mid-prepare).
 */
export function cumulativeLadderCost(costRow: readonly number[] | undefined, steps: number): number {
    if (costRow === undefined) return 0;
    let total = 0;
    for (let i = 0; i < steps && i < costRow.length; i += 1) {
        total += costRow[i] ?? 0;
    }
    return total;
}

/** Count how many of an advance's aptitudes the character actually holds. */
export function countMatches(held: readonly string[], required: readonly string[]): number {
    const heldSet = new Set(held.map((a) => a.toLowerCase()));
    return required.filter((a) => heldSet.has(a.toLowerCase())).length;
}

/** The cost tables a line's `AptitudeBasedSystemConfig` supplies, narrowed to what pricing needs. */
export interface AdvancementCostTables {
    /** `[matchingAptitudes] → per-rank costs`. */
    skill: Record<number, number[]>;
    /** `[matchingAptitudes] → per-tier costs`. */
    characteristic: Record<number, number[]>;
    /** `[tier][matchingAptitudes] → cost`. */
    talent: Record<number, Record<number, number>>;
}

/** One advancement the NPC owns, reduced to what pricing needs. */
interface PricedAdvance {
    /** Aptitudes this advance is priced against. */
    aptitudes: readonly string[];
    /** Rank / tier count purchased (skills, characteristics), or the talent tier. */
    steps: number;
}

/** A skill the NPC has trained, keyed for aptitude lookup. */
export interface NpcSkillAdvance extends PricedAdvance {
    key: string;
}

/** A talent the NPC owns. */
export interface NpcTalentAdvance {
    aptitudes: readonly string[];
    /** Talent tier (1–3); anything outside that range prices as tier 1. */
    tier: number;
}

/** A characteristic the NPC has advanced. */
export interface NpcCharacteristicAdvance extends PricedAdvance {
    key: string;
}

/** The psychic side of an NPC's build. */
export interface NpcPsychicAdvance {
    /** Printed psy rating (0 for a non-psyker). */
    psyRating: number;
    /** Each known power's PR cost, used by `psychicPowerCost`. */
    powerPrCosts: readonly number[];
}

/** Per-class XP breakdown plus the total. */
export interface NpcXpBreakdown {
    skills: number;
    talents: number;
    characteristics: number;
    psychic: number;
    total: number;
}

/** Price one skill's full rank ladder. */
export function skillAdvanceCost(tables: AdvancementCostTables, held: readonly string[], skill: NpcSkillAdvance): number {
    const matches = countMatches(held, skill.aptitudes);
    const steps = Math.min(Math.max(skill.steps, 0), MAX_SKILL_RANK);
    return cumulativeLadderCost(tables.skill[matches], steps);
}

/** Price one characteristic's full advance ladder. */
export function characteristicAdvanceCost(tables: AdvancementCostTables, held: readonly string[], characteristic: NpcCharacteristicAdvance): number {
    const matches = countMatches(held, characteristic.aptitudes);
    const steps = Math.min(Math.max(characteristic.steps, 0), MAX_CHARACTERISTIC_ADVANCES);
    return cumulativeLadderCost(tables.characteristic[matches], steps);
}

/** Price one talent at its tier. A tier outside the table's range prices as tier 1. */
export function talentAdvanceCost(tables: AdvancementCostTables, held: readonly string[], talent: NpcTalentAdvance): number {
    const matches = countMatches(held, talent.aptitudes);
    const row = tables.talent[talent.tier] ?? tables.talent[1];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- parser mismatch: tsconfig.test.json (noUncheckedIndexedAccess off) reports the guard as unnecessary, while tsc under tsconfig.json requires it (TS18048)
    return row?.[matches] ?? 0;
}

/** Price the psychic side: psy rating ladder plus every known power. */
export function psychicAdvanceCost(psychic: NpcPsychicAdvance): number {
    const rating = Math.max(0, Math.floor(psychic.psyRating));
    const powers = psychic.powerPrCosts.reduce((sum, pr) => sum + psychicPowerCost(pr), 0);
    return psyRatingTotalCost(rating) + powers;
}

/** Everything an NPC has bought, ready to price. */
export interface NpcBuild {
    skills: readonly NpcSkillAdvance[];
    talents: readonly NpcTalentAdvance[];
    characteristics: readonly NpcCharacteristicAdvance[];
    psychic: NpcPsychicAdvance;
}

/**
 * Total XP an equivalent PC build would have cost — the NPC's XP at spawn.
 *
 * Every advancement class is charged cumulatively against `held` aptitudes, so
 * the result is the exact ledger a player would have paid to reach this stat
 * block. Returns the per-class breakdown alongside the total so the sheet can
 * show where the XP went.
 */
export function deriveNpcXp(tables: AdvancementCostTables, held: readonly string[], build: NpcBuild): NpcXpBreakdown {
    const skills = build.skills.reduce((sum, s) => sum + skillAdvanceCost(tables, held, s), 0);
    const talents = build.talents.reduce((sum, t) => sum + talentAdvanceCost(tables, held, t), 0);
    const characteristics = build.characteristics.reduce((sum, c) => sum + characteristicAdvanceCost(tables, held, c), 0);
    const psychic = psychicAdvanceCost(build.psychic);
    return { skills, talents, characteristics, psychic, total: skills + talents + characteristics + psychic };
}

/** How many aptitudes a derived NPC set holds. DH2 PCs carry 8 (2 homeworld + 2 background + 3 role + Psyker/extra). */
const DERIVED_APTITUDE_COUNT = 8;

/**
 * Derive the aptitude set a stat block implies.
 *
 * RAW never prints aptitudes for an NPC, so rather than invent them per actor we
 * score every aptitude by how much of *this* NPC's own build it would pay for —
 * each advancement contributes its step count to each of its aptitudes — and keep
 * the highest-scoring `count`. The result is reproducible (same stat block → same
 * set) and self-consistent (the NPC's XP is the cost of the build it actually has).
 *
 * Ties break alphabetically so the output is stable across runs and platforms
 * rather than depending on object key order.
 */
export function deriveAptitudes(build: NpcBuild, count: number = DERIVED_APTITUDE_COUNT): string[] {
    const score = new Map<string, number>();
    const bump = (aptitudes: readonly string[], weight: number): void => {
        for (const apt of aptitudes) {
            if (apt === '') continue;
            score.set(apt, (score.get(apt) ?? 0) + weight);
        }
    };

    for (const skill of build.skills) bump(skill.aptitudes, Math.max(skill.steps, 0));
    for (const characteristic of build.characteristics) bump(characteristic.aptitudes, Math.max(characteristic.steps, 0));
    // A talent is a single purchase regardless of tier, but a higher tier is a
    // stronger signal that the NPC is built around those aptitudes.
    for (const talent of build.talents) bump(talent.aptitudes, Math.max(talent.tier, 1));

    return [...score.entries()]
        .sort(([aName, aScore], [bName, bScore]) => bScore - aScore || aName.localeCompare(bName))
        .slice(0, Math.max(0, count))
        .map(([name]) => name);
}
