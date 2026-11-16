/**
 * @file Career-advancement boot cache (Direction #7).
 *
 * The career advancement tables of the career-based lines (per-tier
 * characteristic costs and every rank's skill/talent advance options) are content, so they live on the
 * line's career `originPath` documents as a structured
 * `system.careerAdvancement` field (see `data/item/origin-path.ts`), NOT as an
 * in-`src/` literal. This module builds a by-registry-key index from those packs
 * on `ready` so the synchronous advancement getters in `./index.ts` and the RT
 * system config can read a career's costs/advances without a hardcoded table.
 *
 * The index is keyed by the legacy camelCase registry key (`rogueTrader`,
 * `archMilitant`, …) — the same keys the advancement UI resolves via
 * `getCareerKeyFromName()` — so every existing consumer stays untouched. The
 * kebab-case compendium `identifier` on each doc is mapped to that key here.
 * This is identifier plumbing, not a content table: no cost/threshold/mechanic
 * value lives in this file.
 */

import { lineBookPacks } from '../../utils/line-packs.ts';
import { type IndexablePack, readPackIndex } from '../../utils/pack-index.ts';
import type { Prerequisite } from '../game-systems/types.ts';

/* -------------------------------------------- */
/*  Public shapes (mirror the pre-migration career-table objects)               */
/* -------------------------------------------- */

/** Per-tier characteristic advancement cost block. */
interface CareerCharacteristicCostTier {
    simple: number;
    intermediate: number;
    trained: number;
    expert: number;
}

/** Map of characteristic key → its per-tier costs. */
type CareerCharacteristicCostTable = Record<string, CareerCharacteristicCostTier>;

/** One advance option (skill or talent) offered at Rank 1. */
interface CareerRankAdvance {
    name: string;
    cost: number;
    type: 'skill' | 'talent';
    specialization?: string;
    multiplier?: number;
    /** A skill advance's rank: 1 trained, 2 +10, 3 +20, 4 +30. */
    level?: number;
    prerequisites: Prerequisite[];
}

/** One rank of a career: its number, printed title, starting XP and the advances it offers. */
interface CareerRank {
    rank: number;
    /** The path a branched rank belongs to ('' for a rank every character of the career takes). */
    branch: string;
    title: string;
    minXp: number | null;
    advances: CareerRankAdvance[];
}

/** Career metadata block (mirrors the prior per-file `CAREER_INFO`). */
interface CareerInfo {
    key: string;
    name: string;
    description: string;
    ranks: string[];
}

/** Full advancement configuration for one career. */
export interface CareerTable {
    CAREER_INFO: CareerInfo;
    CHARACTERISTIC_COSTS: CareerCharacteristicCostTable;
    RANK_1_ADVANCES: CareerRankAdvance[];
    /** Every authored rank, in order; rank 1 merges `rank1Advances` with `ranks[rank=1]`. */
    RANKS: CareerRank[];
    TIER_ORDER: readonly ['simple', 'intermediate', 'trained', 'expert'];
}

/* -------------------------------------------- */
/*  Constants (content-agnostic primitives)                                     */
/* -------------------------------------------- */

/** Shared rank label list — identical across every career. */
const STANDARD_RANKS: readonly string[] = ['Rank 1', 'Rank 2', 'Rank 3', 'Rank 4', 'Rank 5', 'Rank 6', 'Rank 7', 'Rank 8'];

/** Characteristic advancement tier order — a mechanic enum, not content data. */
const STANDARD_TIER_ORDER = ['simple', 'intermediate', 'trained', 'expert'] as const;

/**
 * The lines whose career originPath docs can carry advancement tables (operator
 * ruling 2026-11-14: every career line, every rank), each with the pack category
 * that holds them. Deathwatch's career is its speciality, packed under
 * `origins-specialities`; reading `origins-careers` for it found no pack at all.
 * Deathwatch's Chapters carry advances too, keyed by their own identifiers.
 * A line with no authored career pack contributes nothing.
 */
export const CAREER_PACK_CATEGORIES: Readonly<Record<string, readonly string[]>> = {
    rt: ['origins-careers'],
    dh1: ['origins-careers'],
    // A Battle-Brother also buys his Chapter's advances, authored on each Chapter origin.
    dw: ['origins-specialities', 'origins-chapters'],
};

/** RT's registry keeps its legacy camelCase keys; every other line keys a career by its identifier. */
const LEGACY_KEY_LINE = 'rt';

/**
 * Compendium `identifier` (kebab) → legacy registry key (camel). The camelCase
 * keys are what `getCareerKeyFromName()` returns and what the advancement UI
 * passes to the getters, so the cache is keyed by them to keep callers unchanged.
 */
const IDENTIFIER_TO_KEY: Record<string, string> = {
    'rogue-trader': 'rogueTrader',
    'arch-militant': 'archMilitant',
    'astropath-transcendant': 'astropath',
    'explorator': 'explorator',
    'missionary': 'missionary',
    'navigator': 'navigator',
    'seneschal': 'seneschal',
    'void-master': 'voidMaster',
};

/* -------------------------------------------- */
/*  Pack boundary shapes                                                        */
/* -------------------------------------------- */

/** Raw `system.careerAdvancement` payload as authored on the compendium doc. */
type RawAdvance = {
    name?: string;
    cost?: number;
    type?: string;
    specialization?: string;
    multiplier?: number;
    level?: number | null;
    prerequisites?: Prerequisite[];
};

interface RawCareerAdvancement {
    characteristicCosts?: Record<string, { simple?: number; intermediate?: number; trained?: number; expert?: number } | null>;
    rank1Advances?: RawAdvance[];
    ranks?: Array<{ rank?: number; branch?: string; title?: string; minXp?: number | null; advances?: RawAdvance[] }>;
}

/** The index row of a career this module reads (stored source, `pack-index.ts`). */
interface CareerPackDoc {
    name?: string;
    system?: { identifier?: string | null; careerAdvancement?: RawCareerAdvancement | null };
}
interface PackGameLike {
    packs?: Iterable<IndexablePack<CareerPackDoc>>;
}

/* -------------------------------------------- */
/*  Index state                                                                 */
/* -------------------------------------------- */

/** line → registry key → career table. `null` until the first build. */
let registry: Record<string, Record<string, CareerTable>> | null = null;

/**
 * Settles once the index has been built. The build runs late in the `ready`
 * sequence (after the world's actors hydrate): on a large world that is well after
 * a player can open Advancement, which then listed no advances at all.
 */
let indexBuilt: Promise<void>;
let markIndexBuilt: () => void = () => undefined;
function resetIndexBuilt(): void {
    indexBuilt = new Promise<void>((resolve) => {
        markIndexBuilt = resolve;
    });
}
resetIndexBuilt();

/** Resolves when the career-advancement index is built (at once if it already is). */
export async function careerAdvancementIndexReady(): Promise<void> {
    return indexBuilt;
}

function toInt(value: number | undefined): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Normalize a raw per-characteristic cost map into the strict tier table. */
function normalizeCosts(raw: RawCareerAdvancement['characteristicCosts']): CareerCharacteristicCostTable {
    const out: CareerCharacteristicCostTable = {};
    if (raw == null) return out;
    for (const [charKey, tiers] of Object.entries(raw)) {
        if (tiers == null) continue;
        out[charKey] = {
            simple: toInt(tiers.simple),
            intermediate: toInt(tiers.intermediate),
            trained: toInt(tiers.trained),
            expert: toInt(tiers.expert),
        };
    }
    return out;
}

/** Normalize a raw rank-1 advance list, dropping entries without a name/type. */
function normalizeAdvances(raw: readonly RawAdvance[] | undefined): CareerRankAdvance[] {
    if (raw == null) return [];
    const out: CareerRankAdvance[] = [];
    for (const entry of raw) {
        const type = entry.type;
        if (entry.name === undefined || (type !== 'skill' && type !== 'talent')) continue;
        const advance: CareerRankAdvance = {
            name: entry.name,
            cost: toInt(entry.cost),
            type,
            prerequisites: entry.prerequisites ?? [],
        };
        if (entry.specialization !== undefined) advance.specialization = entry.specialization;
        if (entry.multiplier !== undefined) advance.multiplier = entry.multiplier;
        if (entry.level != null) advance.level = entry.level;
        out.push(advance);
    }
    return out;
}

/**
 * Every authored rank in order. Rank 1 merges the legacy `rank1Advances` list
 * with a `ranks` entry for rank 1; a rank number that is not a whole number of
 * at least 1 is dropped. A branched rank (DH1 prints alternative paths from a
 * rank on: Assault Veteran, Lieutenant or Scout) stays its own entry, keyed by
 * rank and branch, so a character is offered only the path it chose.
 */
function normalizeRanks(raw: RawCareerAdvancement): CareerRank[] {
    const byKey = new Map<string, CareerRank>();
    const rankOne = normalizeAdvances(raw.rank1Advances);
    if (rankOne.length > 0) byKey.set('1|', { rank: 1, branch: '', title: '', minXp: null, advances: rankOne });
    for (const entry of raw.ranks ?? []) {
        const rank = entry.rank;
        if (rank === undefined || !Number.isInteger(rank) || rank < 1) continue;
        const branch = entry.branch ?? '';
        const key = `${rank}|${branch}`;
        const prior = byKey.get(key);
        const advances = normalizeAdvances(entry.advances);
        byKey.set(key, {
            rank,
            branch,
            title: entry.title ?? prior?.title ?? '',
            minXp: entry.minXp ?? prior?.minXp ?? null,
            advances: [...(prior?.advances ?? []), ...advances],
        });
    }
    return [...byKey.values()].sort((a, b) => a.rank - b.rank);
}

/** Reconstruct a full career table from a compendium doc's authored advancement data. */
function buildCareerTable(key: string, name: string, raw: RawCareerAdvancement): CareerTable {
    const ranks = normalizeRanks(raw);
    return {
        CAREER_INFO: { key, name, description: '', ranks: ranks.length > 1 ? ranks.map((r) => r.title || `Rank ${r.rank}`) : [...STANDARD_RANKS] },
        CHARACTERISTIC_COSTS: normalizeCosts(raw.characteristicCosts),
        RANK_1_ADVANCES: ranks.find((r) => r.rank === 1 && r.branch === '')?.advances ?? [],
        RANKS: ranks,
        TIER_ORDER: STANDARD_TIER_ORDER,
    };
}

/**
 * Build the career-advancement index from RT's career origin packs.
 * Call once on `ready`; idempotent (rebuilds the cache). Careers with no
 * authored `careerAdvancement` payload are skipped; where two packs carry the
 * same career, the first pack's copy wins.
 */
export async function buildCareerAdvancementIndex(): Promise<void> {
    const next: Record<string, Record<string, CareerTable>> = {};
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry `game` is a runtime global with no shipped type at this seam
    const packGame = (globalThis as unknown as { game?: PackGameLike }).game;
    const allPacks = [...(packGame?.packs ?? [])];
    await Promise.all(
        Object.entries(CAREER_PACK_CATEGORIES).map(async ([line, categories]) => {
            const packs = categories.flatMap((category) => lineBookPacks(allPacks, line, category));
            // Index rows, not documents (#706): the shared request carries `system.careerAdvancement`.
            const loaded = await Promise.all(packs.map(async (pack) => [...(await readPackIndex(pack))]));
            const careers: Record<string, CareerTable> = {};
            for (const doc of loaded.flat()) {
                const identifier = doc.system?.identifier;
                if (typeof identifier !== 'string') continue;
                const key = line === LEGACY_KEY_LINE ? IDENTIFIER_TO_KEY[identifier] : identifier;
                // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess (tsconfig.strict.json) types this record access as string|undefined; the main/ESLint config has the flag off and sees the guard as redundant
                if (key === undefined) continue;
                const raw = doc.system?.careerAdvancement;
                if (raw == null || key in careers) continue;
                careers[key] = buildCareerTable(key, typeof doc.name === 'string' ? doc.name : key, raw);
            }
            next[line] = careers;
        }),
    );
    registry = next;
    markIndexBuilt();
}

/**
 * A line's career-advancement registry: RT's keyed by its legacy camelCase career
 * key, every other line's by the career's identifier. Empty until
 * `buildCareerAdvancementIndex()` has run, and for a line with no career tables.
 */
export function getCareerAdvancementRegistry(line = LEGACY_KEY_LINE): Record<string, CareerTable> {
    return registry?.[line] ?? {};
}

/** True once the index has been built at least once. */
export function isCareerAdvancementIndexReady(): boolean {
    return registry !== null;
}

/**
 * Seed the index directly (unit tests / stories — no Foundry pack available
 * there). Replaces the whole registry.
 */
export function setCareerAdvancementsForTesting(entries: Record<string, CareerTable>, line = LEGACY_KEY_LINE): void {
    registry = { [line]: entries };
    markIndexBuilt();
}

/** Reset the index to its unbuilt state (test cleanup). */
export function resetCareerAdvancementIndexForTesting(): void {
    registry = null;
    resetIndexBuilt();
}
