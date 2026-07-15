/**
 * Compendium-sourced Daemon Weapon Attribute tables + roller (#142).
 *
 * Per Direction #7, the Attribute tables themselves (the roll-determined
 * names + effect prose that used to be a literal array here) are
 * GW-copyrighted content and live ONLY in the packs submodule as
 * `RollTable` documents in `wh40k-rpg.bc-core-rolltables` — one table per
 * daemonic alignment (`general`, `khorne`, `nurgle`, `slaanesh`,
 * `tzeentch`), each tagged with `flags['wh40k-rpg'].daemonWeaponAttributeTable`
 * and each result carrying `flags['wh40k-rpg'].attribute` ({ id, label,
 * effect }). This module owns the single read path plus the
 * content-agnostic roll mechanics (how many slots a Binding Strength
 * grants, and the "slot 1 = General, later slots = aligned" routing).
 *
 * No DataModel coupling. The only Foundry surface touched is the
 * `game.packs` collection — a framework boundary (untyped document shape)
 * narrowed locally to the fields read.
 */

import type { ChaosAlignment } from '../config/game-systems/types.ts';
import { clampRoll, findBandBy, rollDie, type Rng } from './_dice.ts';
import { BINDING_STRENGTH_PROFILES, type BindingStrength } from './daemon-weapon.ts';

/** A single 1d10 entry on a Daemon Weapon Attribute table. */
export interface DaemonWeaponAttribute {
    /** Stable identifier (kebab-case, e.g. `khorne.skull-taker`). */
    readonly id: string;
    /** Inclusive [min, max] 1d10 range that maps to this entry. */
    readonly roll: readonly [number, number];
    /** Display label of the Attribute. */
    readonly label: string;
    /** Mechanical-rider summary (single sentence). */
    readonly effect: string;
}

/** Discriminator for the five distinct Attribute tables. */
export type DaemonWeaponAttributeTable = 'general' | 'khorne' | 'nurgle' | 'slaanesh' | 'tzeentch';

/** The five recognised table keys, in canonical order. */
export const DAEMON_WEAPON_ATTRIBUTE_TABLE_KEYS: readonly DaemonWeaponAttributeTable[] = ['general', 'khorne', 'nurgle', 'slaanesh', 'tzeentch'];

/** Loaded tables, keyed by table discriminator. */
export type DaemonWeaponAttributeTables = ReadonlyMap<DaemonWeaponAttributeTable, readonly DaemonWeaponAttribute[]>;

/** Fully-qualified pack that hosts the five Attribute RollTables. */
export const DAEMON_WEAPON_ATTRIBUTE_PACK = 'wh40k-rpg.bc-core-rolltables';

/* -------------------------------------------- */
/*  Raw document shape (compendium boundary)    */
/* -------------------------------------------- */

/** The subset of a `TableResult` this reader projects. */
interface RawTableResult {
    readonly range?: readonly number[] | null;
    readonly flags?: {
        readonly 'wh40k-rpg'?: {
            readonly attribute?: { readonly id?: string; readonly label?: string; readonly effect?: string };
        };
    };
}

/** The subset of a `RollTable` document this reader projects. */
interface RawRollTable {
    readonly results?: Iterable<RawTableResult>;
    readonly flags?: { readonly 'wh40k-rpg'?: { readonly daemonWeaponAttributeTable?: string } };
}

/** Minimal pack surface: a collection whose documents this reader loads. */
interface DaemonWeaponAttributePack {
    /** Optional — a locked or unavailable pack may not expose it; the reader guards for that. */
    readonly getDocuments?: () => Promise<readonly RawRollTable[]>;
}

/* -------------------------------------------- */
/*  Table routing (content-agnostic mechanics)  */
/* -------------------------------------------- */

/** Map a ChaosAlignment onto the table the second-and-later rolls should hit. */
export function tableForAlignment(alignment: ChaosAlignment): DaemonWeaponAttributeTable {
    if (alignment === 'unaligned') return 'general';
    return alignment;
}

function isTableKey(value: string | undefined): value is DaemonWeaponAttributeTable {
    return value !== undefined && (DAEMON_WEAPON_ATTRIBUTE_TABLE_KEYS as readonly string[]).includes(value);
}

/** Project one `TableResult` into a {@link DaemonWeaponAttribute}, or `null` when it lacks a usable range. */
function projectResult(result: RawTableResult): DaemonWeaponAttribute | null {
    const attribute = result.flags?.['wh40k-rpg']?.attribute;
    const range = result.range;
    if (range === undefined || range === null || range.length < 2) return null;
    const lo = range[0];
    const hi = range[1];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- noUncheckedIndexedAccess (tsconfig.strict.json) types range[n] as number|undefined; the main/ESLint config has the flag off and sees the guard as redundant
    if (lo === undefined || hi === undefined) return null;
    return {
        id: attribute?.id ?? '',
        roll: [lo, hi],
        label: attribute?.label ?? '',
        effect: attribute?.effect ?? '',
    };
}

/* -------------------------------------------- */
/*  Reader                                       */
/* -------------------------------------------- */

/**
 * Load the Daemon Weapon Attribute RollTables from the packs submodule and
 * project each into an ordered {@link DaemonWeaponAttribute} list, keyed by
 * the table's `daemonWeaponAttributeTable` flag. A missing pack (packs
 * submodule absent, pack disabled, documentClass not ready) yields an empty
 * Map rather than throwing, so the roller degrades gracefully.
 *
 * @param packName Fully-qualified pack id; defaults to {@link DAEMON_WEAPON_ATTRIBUTE_PACK}.
 */
export async function readDaemonWeaponAttributeTables(packName: string = DAEMON_WEAPON_ATTRIBUTE_PACK): Promise<DaemonWeaponAttributeTables> {
    // eslint-disable-next-line no-restricted-syntax -- boundary: game.packs.get returns Foundry's CompendiumCollection (untyped document shape); narrowed locally to the DaemonWeaponAttributePack surface this reader reads
    const pack = game.packs.get(packName) as DaemonWeaponAttributePack | undefined;
    const out = new Map<DaemonWeaponAttributeTable, readonly DaemonWeaponAttribute[]>();
    if (pack?.getDocuments === undefined) return out;

    let docs: readonly RawRollTable[];
    try {
        // Call as a method (not a detached reference) so Foundry's CompendiumCollection
        // keeps its `this` binding inside getDocuments().
        docs = await pack.getDocuments();
    } catch (err) {
        // A pack whose documentClass isn't ready yet throws inside getDocuments
        // ("...reading 'database'"). Degrade to empty tables rather than letting
        // an uncaught error escape the dialog's render.
        console.warn(`readDaemonWeaponAttributeTables: ${packName} getDocuments failed`, err);
        return out;
    }

    for (const doc of docs) {
        const key = doc.flags?.['wh40k-rpg']?.daemonWeaponAttributeTable;
        if (!isTableKey(key)) continue;
        const entries: DaemonWeaponAttribute[] = [];
        for (const result of doc.results ?? []) {
            const projected = projectResult(result);
            if (projected !== null) entries.push(projected);
        }
        entries.sort((a, b) => a.roll[0] - b.roll[0]);
        out.set(key, entries);
    }
    return out;
}

/* -------------------------------------------- */
/*  Roller (content-agnostic mechanics)          */
/* -------------------------------------------- */

/** Resolve a 1d10 roll value against a loaded table; `undefined` when the table is absent/empty. */
export function attributeAtRoll(tables: DaemonWeaponAttributeTables, table: DaemonWeaponAttributeTable, roll: number): DaemonWeaponAttribute | undefined {
    const entries = tables.get(table);
    if (entries === undefined || entries.length === 0) return undefined;
    const clamped = clampRoll(roll, { max: 10 });
    // clamp: true so an out-of-band roll snaps to the first/last row rather than
    // returning undefined — the tables are exhaustive over 1..10 by construction.
    return findBandBy(entries, clamped, (entry) => entry.roll, { clamp: true });
}

/** One resolved Attribute slot. */
interface DaemonWeaponAttributePick {
    /** 1-based slot index. */
    readonly slot: number;
    /** Table the slot rolled on. */
    readonly table: DaemonWeaponAttributeTable;
    /** The 1d10 value rolled for the slot. */
    readonly roll: number;
    /** Resolved Attribute (empty label/effect when the pack is absent). */
    readonly attribute: DaemonWeaponAttribute;
}

/** Result of a Daemon Weapon Attribute roll session. */
export interface DaemonWeaponAttributeRollResult {
    /** Number of Attribute slots granted by Binding Strength. */
    readonly slots: number;
    /** Resolved Attribute per slot, with the d10 value that selected it. */
    readonly picks: readonly DaemonWeaponAttributePick[];
}

/**
 * Roll Attributes for a Daemon Weapon against the loaded compendium tables.
 *
 * @param alignment       The weapon's daemonic alignment.
 * @param bindingStrength Drives how many slots are rolled.
 * @param tables          Loaded tables (see {@link readDaemonWeaponAttributeTables}).
 * @param rng             Optional injectable RNG; defaults to Math.random.
 */
export function rollDaemonWeaponAttributes(
    alignment: ChaosAlignment,
    bindingStrength: BindingStrength,
    tables: DaemonWeaponAttributeTables,
    rng: Rng = Math.random,
): DaemonWeaponAttributeRollResult {
    const slots = BINDING_STRENGTH_PROFILES[bindingStrength].attributes;
    const alignedTable = tableForAlignment(alignment);
    const picks: DaemonWeaponAttributePick[] = [];
    for (let slot = 1; slot <= slots; slot += 1) {
        // Slot 1 always rolls on the General table; later slots roll on the aligned table.
        const table: DaemonWeaponAttributeTable = slot === 1 ? 'general' : alignedTable;
        const roll = rollDie(10, rng);
        const attribute = attributeAtRoll(tables, table, roll) ?? { id: '', roll: [roll, roll], label: '', effect: '' };
        picks.push({ slot, table, roll, attribute });
    }
    return { slots, picks };
}
