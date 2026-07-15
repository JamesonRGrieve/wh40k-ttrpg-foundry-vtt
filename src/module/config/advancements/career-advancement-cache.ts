/**
 * @file Career-advancement boot cache (Direction #7).
 *
 * The Rogue Trader career advancement tables (per-tier characteristic costs and
 * Rank 1 skill/talent advance options) are content, so they live on the
 * `rt-core-origins-careers` compendium `originPath` documents as a structured
 * `system.careerAdvancement` field (see `data/item/origin-path.ts`), NOT as an
 * in-`src/` literal. This module builds a by-registry-key index from that pack
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

import { SYSTEM_ID } from '../../constants.ts';
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
    prerequisites: Prerequisite[];
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
    TIER_ORDER: readonly ['simple', 'intermediate', 'trained', 'expert'];
}

/* -------------------------------------------- */
/*  Constants (content-agnostic primitives)                                     */
/* -------------------------------------------- */

/** Shared rank label list — identical across every career. */
const STANDARD_RANKS: readonly string[] = ['Rank 1', 'Rank 2', 'Rank 3', 'Rank 4', 'Rank 5', 'Rank 6', 'Rank 7', 'Rank 8'];

/** Characteristic advancement tier order — a mechanic enum, not content data. */
const STANDARD_TIER_ORDER = ['simple', 'intermediate', 'trained', 'expert'] as const;

/** Full compendium pack id holding the RT career originPath docs. */
const CAREERS_PACK_ID = `${SYSTEM_ID}.rt-core-origins-careers`;

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
interface RawCareerAdvancement {
    characteristicCosts?: Record<string, { simple?: number; intermediate?: number; trained?: number; expert?: number } | null>;
    rank1Advances?: Array<{ name?: string; cost?: number; type?: string; specialization?: string; multiplier?: number; prerequisites?: Prerequisite[] }>;
}

interface CareerPackDoc {
    name?: string;
    system?: { identifier?: string; careerAdvancement?: RawCareerAdvancement | null };
}
interface CareerPack {
    getDocuments?: () => Promise<CareerPackDoc[]>;
}
interface PackGameLike {
    packs?: { get?: (id: string) => CareerPack | undefined };
}

/* -------------------------------------------- */
/*  Index state                                                                 */
/* -------------------------------------------- */

/** camelCase registry key → career table. `null` until the first build. */
let registry: Record<string, CareerTable> | null = null;

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
function normalizeAdvances(raw: RawCareerAdvancement['rank1Advances']): CareerRankAdvance[] {
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
        out.push(advance);
    }
    return out;
}

/** Reconstruct a full career table from a compendium doc's authored advancement data. */
function buildCareerTable(key: string, name: string, raw: RawCareerAdvancement): CareerTable {
    return {
        CAREER_INFO: { key, name, description: '', ranks: [...STANDARD_RANKS] },
        CHARACTERISTIC_COSTS: normalizeCosts(raw.characteristicCosts),
        RANK_1_ADVANCES: normalizeAdvances(raw.rank1Advances),
        TIER_ORDER: STANDARD_TIER_ORDER,
    };
}

/**
 * Build the career-advancement index from the `rt-core-origins-careers` pack.
 * Call once on `ready`; idempotent (rebuilds the cache). Careers with no
 * authored `careerAdvancement` payload are skipped.
 */
export async function buildCareerAdvancementIndex(): Promise<void> {
    const next: Record<string, CareerTable> = {};
    // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry `game` is a runtime global with no shipped type at this seam
    const packGame = (globalThis as unknown as { game?: PackGameLike }).game;
    const pack = packGame?.packs?.get?.(CAREERS_PACK_ID);
    if (pack?.getDocuments === undefined) {
        registry = next;
        return;
    }
    // Bind to the owning pack — `getDocuments` reads `this.documentClass` internally.
    const getDocuments = pack.getDocuments.bind(pack);
    const docs = await getDocuments();
    for (const doc of docs) {
        const identifier = doc.system?.identifier;
        if (typeof identifier !== 'string') continue;
        const key = IDENTIFIER_TO_KEY[identifier];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess (tsconfig.strict.json) types this record access as string|undefined; the main/ESLint config has the flag off and sees the guard as redundant
        if (key === undefined) continue;
        const raw = doc.system?.careerAdvancement;
        if (raw == null) continue;
        next[key] = buildCareerTable(key, typeof doc.name === 'string' ? doc.name : key, raw);
    }
    registry = next;
}

/**
 * The career-advancement registry keyed by camelCase career key. Returns an
 * empty object until `buildCareerAdvancementIndex()` has run.
 */
export function getCareerAdvancementRegistry(): Record<string, CareerTable> {
    return registry ?? {};
}

/** True once the index has been built at least once. */
export function isCareerAdvancementIndexReady(): boolean {
    return registry !== null;
}

/**
 * Seed the index directly (unit tests / stories — no Foundry pack available
 * there). Replaces the whole registry.
 */
export function setCareerAdvancementsForTesting(entries: Record<string, CareerTable>): void {
    registry = entries;
}

/** Reset the index to its unbuilt state (test cleanup). */
export function resetCareerAdvancementIndexForTesting(): void {
    registry = null;
}
