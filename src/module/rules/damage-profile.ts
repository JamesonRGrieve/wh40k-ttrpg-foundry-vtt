/**
 * Contextual damage profiles (#608).
 *
 * Most weapons print one damage profile. A few print damage that depends on the
 * attack itself, which no single `damage` profile can hold:
 *
 * - **Range bands** — an ordered list of profiles, picked by the measured attack
 *   distance (a Conversion Beamer hits harder the further its beam travels).
 * - **A roll table** — a RollTable whose results carry the damage profile and the
 *   effect (a Callophean Psy-Engine discharges whatever its caged psykers manage).
 * - **A borrowed profile** — the damage of another weapon: the weapon mounted on
 *   this one (a Tarantula fires the heavy-weapon pair installed on it) or the
 *   wielder's own melee weapon (a Magna-Grapple hits as hard as the Dreadnought's fist).
 *
 * The shapes live on the shared `DamageTemplate` as data (Direction #7); this module
 * holds the content-agnostic resolution: band selection, table projection and the
 * choice of the weapon to borrow from. Nothing here names a weapon.
 */

import { t } from '../i18n/t.ts';
import { stripHtmlTags } from '../utils/format.ts';
import { findBandBy } from './_dice.ts';

/** Damage types a profile may deal (shared by the base profile and each band). */
export const DAMAGE_TYPE_CHOICES = ['impact', 'rending', 'explosive', 'energy', 'fire', 'shock', 'cold', 'toxic'] as const;

/** One damage type key. */
type DamageTypeKey = (typeof DAMAGE_TYPE_CHOICES)[number];

const DAMAGE_TYPE_ABBREVIATIONS: Readonly<Record<DamageTypeKey, string>> = {
    impact: 'I',
    rending: 'R',
    explosive: 'X',
    energy: 'E',
    fire: 'F',
    shock: 'S',
    cold: 'C',
    toxic: 'T',
};

function isDamageTypeKey(type: string): type is DamageTypeKey {
    return (DAMAGE_TYPE_CHOICES as readonly string[]).includes(type);
}

/** The one-letter abbreviation the books print after a damage roll (`E`, `X`, …). */
export function damageTypeAbbreviation(type: string): string {
    return isDamageTypeKey(type) ? DAMAGE_TYPE_ABBREVIATIONS[type] : type.charAt(0).toUpperCase();
}

/**
 * Where a borrowed profile comes from. `''` = the weapon's own profile.
 * - `mount`: the weapon installed on this one (its hardpoint names this weapon).
 * - `wielder-melee`: the wielder's own melee weapon.
 */
export const DAMAGE_SOURCE_CHOICES = ['', 'mount', 'wielder-melee'] as const;

/** One borrowed-profile source. */
export type DamageSourceKind = (typeof DAMAGE_SOURCE_CHOICES)[number];

/** A borrowed-profile source other than the weapon's own. */
export type BorrowedDamageSource = Exclude<DamageSourceKind, ''>;

/** One range band of a band-profile weapon, as authored on `damage.bands`. */
export interface DamageBand {
    /** Inclusive upper bound in metres; `null` = no upper bound (the last band). */
    maxRange: number | null;
    /** The band's damage dice. */
    formula: string;
    type: string;
    penetration: number;
    bonus: number;
    /** Quality ids the band adds (`felling-1`, `blast-2`). */
    qualities: string[];
}

/** The damage a RollTable result carries, as authored on `flags['wh40k-rpg'].damageProfile`. */
interface TableDamageProfile {
    formula: string;
    bonus: number;
    type: string;
    penetration: number;
    qualities: string[];
}

/** Why a hit dealt the damage it did, rendered on the damage card. */
export type DamageProfileProvenance =
    | { kind: 'band'; index: number; count: number; minRange: number | null; maxRange: number | null; distance: number }
    | { kind: 'out-of-band'; distance: number }
    | { kind: 'table'; tableName: string; total: number; text: string }
    | { kind: 'table-missing' }
    | { kind: 'mount'; weaponName: string }
    | { kind: 'wielder-melee'; weaponName: string }
    | { kind: 'no-borrowed'; from: BorrowedDamageSource };

/**
 * The profile a hit resolved at attack time. `formula` already folds the weapon's
 * bonuses; an empty `formula` means this hit deals no damage (out of every band, a
 * table result with no damage, no weapon to borrow from).
 */
export interface ResolvedDamageProfile {
    formula: string;
    type: string;
    penetration: number;
    qualities: readonly string[];
    /** The borrowed melee weapon adds the wielder's Strength Bonus, as it would in hand. */
    addsStrengthBonus: boolean;
    provenance: DamageProfileProvenance;
}

/** What the weapon's damage depends on at attack time. */
export interface DamageProfileContext {
    /** Measured attack distance in metres (0 when no target was measured). */
    distance: number;
    /** The table result drawn for this hit; null before the draw (the attack stage). */
    tableDraw: DamageTableDraw | null;
}

/* -------------------------------------------- */
/*  Range bands                                 */
/* -------------------------------------------- */

/**
 * The band an attack at `distance` uses: the first band (in authored order) whose
 * `maxRange` is at least the distance, or an unbounded band. Bounds are inclusive,
 * matching the range brackets (`rules/range.ts`): a target at exactly Short Range is
 * at Short Range. A negative or non-finite distance reads as 0. Null when no band
 * reaches the distance.
 */
export function selectDamageBand(bands: readonly DamageBand[], distance: number): { band: DamageBand; index: number } | null {
    const measured = Number.isFinite(distance) && distance > 0 ? distance : 0;
    const index = bands.findIndex((candidate) => candidate.maxRange === null || measured <= candidate.maxRange);
    const band = bands.at(index);
    if (index < 0 || band === undefined) return null;
    return { band, index };
}

/** Provenance for the band at `index`: its position and the distances it covers. */
export function bandProvenance(bands: readonly DamageBand[], index: number, distance: number): DamageProfileProvenance {
    const band = bands.at(index);
    const previous = index > 0 ? bands.at(index - 1) : undefined;
    return {
        kind: 'band',
        index: index + 1,
        count: bands.length,
        minRange: previous?.maxRange ?? null,
        maxRange: band?.maxRange ?? null,
        distance,
    };
}

/**
 * The penetration a banded weapon's sheet shows (#614): one value when every band
 * shares it, else each band's in authored order, compact (`2/8/14`) to fit one stat
 * tile. An empty list reads as 0.
 */
export function bandPenetrationLabel(penetrations: readonly number[]): string {
    const distinct = new Set(penetrations);
    if (distinct.size <= 1) return String(penetrations.at(0) ?? 0);
    return penetrations.map(String).join('/');
}

/* -------------------------------------------- */
/*  Roll-table damage                           */
/* -------------------------------------------- */

/** The subset of a `TableResult` this reader projects (compendium boundary). */
export interface RawDamageTableResult {
    readonly range?: readonly number[] | null;
    readonly text?: string | null;
    readonly description?: string | null;
    readonly flags?: { readonly 'wh40k-rpg'?: { readonly damageProfile?: Partial<TableDamageProfile> | null } | null } | null;
}

/** One projected table row. `profile` is null for a result that deals no damage. */
export interface DamageTableRow {
    range: readonly [number, number];
    text: string;
    profile: TableDamageProfile | null;
}

/** A drawn table result. */
export interface DamageTableDraw {
    tableName: string;
    total: number;
    row: DamageTableRow;
}

function projectTableProfile(raw: Partial<TableDamageProfile> | null | undefined): TableDamageProfile | null {
    if (raw === null || raw === undefined || typeof raw.formula !== 'string' || raw.formula === '') return null;
    return {
        formula: raw.formula,
        bonus: typeof raw.bonus === 'number' ? raw.bonus : 0,
        type: typeof raw.type === 'string' && raw.type !== '' ? raw.type : 'impact',
        penetration: typeof raw.penetration === 'number' ? raw.penetration : 0,
        qualities: Array.isArray(raw.qualities) ? raw.qualities.filter((q): q is string => typeof q === 'string') : [],
    };
}

/** Project a table's results into rows, dropping any without a usable range. */
export function projectDamageTableRows(results: Iterable<RawDamageTableResult>): DamageTableRow[] {
    const rows: DamageTableRow[] = [];
    for (const result of results) {
        const lo = result.range?.at(0);
        const hi = result.range?.at(1);
        if (lo === undefined || hi === undefined) continue;
        const html = result.description ?? result.text ?? '';
        rows.push({ range: [lo, hi], text: stripHtmlTags(html).trim(), profile: projectTableProfile(result.flags?.['wh40k-rpg']?.damageProfile) });
    }
    return rows.sort((a, b) => a.range[0] - b.range[0]);
}

/**
 * The row a table total lands on. A total pushed past the table's edge by a bonus
 * (a psyker steadying the engine adds +10) snaps to the last row, like any table.
 */
export function pickDamageTableRow(rows: readonly DamageTableRow[], total: number): DamageTableRow | undefined {
    return findBandBy(rows, total, (row) => row.range);
}

/** The subset of a `RollTable` document the draw reads (framework boundary). */
interface RawDamageTable {
    readonly name: string;
    readonly formula?: string | null;
    readonly results?: Iterable<RawDamageTableResult> | null;
}

/**
 * Roll a damage table by UUID: evaluate its formula and pick the row. Null when the
 * table cannot be loaded (missing pack, bad UUID), so the hit reports it instead of
 * guessing at damage.
 */
export async function drawDamageTable(uuid: string): Promise<DamageTableDraw | null> {
    let table: RawDamageTable | null = null;
    try {
        // fromUuid's document union is narrowed to the RollTable fields this draw reads.
        table = (await fromUuid(uuid)) as RawDamageTable | null;
    } catch (err) {
        console.warn(`drawDamageTable: could not load ${uuid}`, err);
        return null;
    }
    if (table === null) return null;
    const rows = projectDamageTableRows(table.results ?? []);
    const formula = typeof table.formula === 'string' && table.formula !== '' ? table.formula : '1d100';
    const roll = await new Roll(formula).evaluate();
    const total = roll.total;
    const row = pickDamageTableRow(rows, total);
    if (row === undefined) return null;
    return { tableName: table.name, total, row };
}

/* -------------------------------------------- */
/*  Borrowed profiles                           */
/* -------------------------------------------- */

/** The facts about a candidate weapon the borrow choice reads. */
export interface BorrowCandidate {
    /** Embedded item id. */
    id: string;
    /** The weapon's hardpoint: the id of whatever it is installed in, or ''. */
    hardpoint: string;
    /** An always-on weapon (a Dreadnought's Basic Melee Attack). */
    innate: boolean;
    isMelee: boolean;
    /** Equipped, or installed in a hardpoint: the weapon is in hand / on the chassis. */
    inUse: boolean;
    /** The candidate borrows its own damage, so it cannot lend one (no chains, no cycles). */
    borrowsDamage: boolean;
}

/** The host weapon doing the borrowing. */
export interface BorrowHost {
    id: string;
    /** Content identifier, matched by an authored mount's `hardpoint` (stable across copies). */
    identifier: string;
}

/**
 * The weapon a host borrows its damage from, or null.
 *
 * - `mount`: the weapon installed on the host — its `hardpoint` names the host's
 *   embedded id or its content identifier (the #572 loadout field, here pointing at
 *   a weapon platform rather than a vehicle hardpoint).
 * - `wielder-melee`: the wielder's melee weapon in use, preferring a fitted weapon
 *   over an innate strike (the Dreadnought's fist over its Basic Melee Attack).
 *
 * The first match in item order wins; the card names the weapon chosen.
 */
export function pickBorrowedWeapon<T extends BorrowCandidate>(source: BorrowedDamageSource, host: BorrowHost, candidates: readonly T[]): T | null {
    const lenders = candidates.filter((candidate) => candidate.id !== host.id && !candidate.borrowsDamage);
    if (source === 'mount') {
        const names = [host.id, host.identifier].filter((name) => name !== '');
        return lenders.find((candidate) => names.includes(candidate.hardpoint)) ?? null;
    }
    const melee = lenders.filter((candidate) => candidate.isMelee && (candidate.inUse || candidate.innate));
    return melee.find((candidate) => !candidate.innate) ?? melee.find((candidate) => candidate.innate) ?? null;
}

/* -------------------------------------------- */
/*  Card labels                                 */
/* -------------------------------------------- */

/** The band's line on the damage card: which band, and the distances it covers. */
function bandLabel(p: Extract<DamageProfileProvenance, { kind: 'band' }>): string {
    const base = { index: p.index, count: p.count, distance: p.distance };
    if (p.maxRange !== null) return t('WH40K.Chat.Damage.ProfileBandUpTo', { ...base, max: p.maxRange });
    if (p.minRange !== null) return t('WH40K.Chat.Damage.ProfileBandBeyond', { ...base, min: p.minRange });
    return t('WH40K.Chat.Damage.ProfileBandAny', base);
}

/** The damage card's statement of which band / table result / borrowed weapon applied. */
export function describeDamageProvenance(provenance: DamageProfileProvenance): string {
    if (provenance.kind === 'band') return bandLabel(provenance);
    if (provenance.kind === 'out-of-band') return t('WH40K.Chat.Damage.ProfileOutOfBand', { distance: provenance.distance });
    if (provenance.kind === 'table') return t('WH40K.Chat.Damage.ProfileTable', { table: provenance.tableName, total: provenance.total });
    if (provenance.kind === 'table-missing') return t('WH40K.Chat.Damage.ProfileTableMissing');
    if (provenance.kind === 'mount') return t('WH40K.Chat.Damage.ProfileMount', { weapon: provenance.weaponName });
    if (provenance.kind === 'wielder-melee') return t('WH40K.Chat.Damage.ProfileWielderMelee', { weapon: provenance.weaponName });
    return provenance.from === 'mount' ? t('WH40K.Chat.Damage.ProfileNoMount') : t('WH40K.Chat.Damage.ProfileNoWielderMelee');
}
