/**
 * Token senses from item data (#582).
 *
 * A trait, talent, cybernetic or piece of gear declares what it lets its bearer
 * perceive as a structured `modifiers.senses` hook authored in the compendium
 * `_source` (Direction #7). Dark-sight declares a `darkvision` vision mode;
 * Unnatural Senses (X) declares a `senseAll` detection mode whose range is the
 * X authored on the owned item. This module folds an actor's hooks into the
 * token `sight` / `detectionModes` update — no trait name or actor type is ever
 * matched here.
 */

/** Whether a hook sets the token's vision mode or adds a detection mode. */
export const SENSE_KINDS = ['vision', 'detection'] as const;
type SenseKind = (typeof SENSE_KINDS)[number];

/**
 * Where a hook reads its range from: `''` = the static `range`; `specialization`
 * = the leading number of the owned item's specialization (`"30 metres"` → 30,
 * how "(X)" traits record X); `level` = the owned item's level/rating.
 */
export const SENSE_RANGE_SOURCES = ['', 'specialization', 'level'] as const;
type SenseRangeSource = (typeof SENSE_RANGE_SOURCES)[number];

/** One authored sense hook (`modifiers.senses[]`). */
export interface SenseEntry {
    kind: SenseKind;
    /** A Foundry vision-mode id (`darkvision`, …) or detection-mode id (`senseAll`, …). */
    mode: string;
    /** Range in scene distance units; `null` = unlimited. Also the fallback when `rangeSource` yields nothing. */
    range: number | null;
    rangeSource: SenseRangeSource;
}

/** The facts about one owned item the resolver reads. */
export interface SenseBearer {
    senses: readonly SenseEntry[];
    specialization?: string | null | undefined;
    level?: number | null | undefined;
}

/** The token vision state resolved from every hook an actor carries. */
export interface ResolvedSenses {
    /** The first vision mode declared (at the widest declared range), or `null` when no hook sets one. */
    vision: { mode: string; range: number | null } | null;
    /** Detection modes by id, each at the widest declared range. */
    detection: Record<string, number | null>;
}

/** The first number in a specialization string (`"Unnatural Senses (40m)"` → 40), or null. */
function leadingNumber(text: string | null | undefined): number | null {
    const match = /\d+(?:\.\d+)?/.exec(text ?? '');
    return match === null ? null : Number(match[0]);
}

/** Resolve one hook's range against the item that carries it. */
function entryRange(entry: SenseEntry, bearer: SenseBearer): number | null {
    if (entry.rangeSource === 'specialization') {
        const parsed = leadingNumber(bearer.specialization);
        if (parsed !== null && parsed > 0) return parsed;
    } else if (entry.rangeSource === 'level') {
        const level = bearer.level ?? 0;
        if (level > 0) return level;
    }
    return entry.range;
}

/** The slice of an owned item's system data a sense hook lives on. */
interface SenseCarryingSystem {
    modifiers: { senses: readonly SenseEntry[] };
    specialization?: string | null;
    level?: number | null;
}

/** Does this item system carry the `modifiers.senses` channel (i.e. use ModifiersTemplate)? */
function carriesSenses(system: object): system is SenseCarryingSystem {
    if (!('modifiers' in system)) return false;
    const modifiers = system.modifiers;
    return typeof modifiers === 'object' && modifiers !== null && 'senses' in modifiers && Array.isArray(modifiers.senses);
}

/**
 * The sense bearers among an actor's owned items — every item whose type carries
 * the `modifiers.senses` channel, with its specialization/level for "(X)" ranges.
 * @param items  The actor's owned items.
 */
export function senseBearersOf(items: Iterable<{ system: object }>): SenseBearer[] {
    const bearers: SenseBearer[] = [];
    for (const item of items) {
        const system = item.system;
        if (!carriesSenses(system) || system.modifiers.senses.length === 0) continue;
        bearers.push({ senses: system.modifiers.senses, specialization: system.specialization, level: system.level });
    }
    return bearers;
}

/** `null` (unlimited) beats any finite range; otherwise the larger wins. */
function widerRange(a: number | null, b: number | null): number | null {
    if (a === null || b === null) return null;
    return Math.max(a, b);
}

/**
 * Fold the sense hooks on an actor's owned items into one token vision state.
 * Pure — the caller walks the items.
 * @param bearers  Every owned item's hooks plus its specialization/level.
 */
export function resolveSenses(bearers: Iterable<SenseBearer>): ResolvedSenses {
    const resolved: ResolvedSenses = { vision: null, detection: {} };
    for (const bearer of bearers) {
        for (const entry of bearer.senses) {
            if (entry.mode === '') continue;
            const range = entryRange(entry, bearer);
            if (entry.kind === 'vision') {
                const current = resolved.vision;
                resolved.vision = current === null ? { mode: entry.mode, range } : { mode: current.mode, range: widerRange(current.range, range) };
            } else {
                const id = entry.mode;
                resolved.detection[id] = id in resolved.detection ? widerRange(resolved.detection[id] ?? null, range) : range;
            }
        }
    }
    return resolved;
}

/**
 * The dotted-path token update for a resolved sense state: sight is always
 * enabled, a declared vision mode + range is applied, and each detection mode is
 * added enabled at its range. An actor with no hooks just gets sight turned on.
 * @param senses  From {@link resolveSenses}.
 */
export function tokenSensesUpdate(senses: ResolvedSenses): Record<string, string | number | boolean | null | { enabled: boolean; range: number | null }> {
    const update: Record<string, string | number | boolean | null | { enabled: boolean; range: number | null }> = { 'sight.enabled': true };
    if (senses.vision !== null) {
        update['sight.visionMode'] = senses.vision.mode;
        update['sight.range'] = senses.vision.range;
    }
    for (const [id, range] of Object.entries(senses.detection)) {
        update[`detectionModes.${id}`] = { enabled: true, range };
    }
    return update;
}
