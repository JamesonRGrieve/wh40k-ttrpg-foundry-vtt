/**
 * The condition catalog — content-agnostic plumbing that projects the CONDITION
 * COMPENDIUM DOCUMENTS (`type: condition`) into the three places a condition is
 * used: the token HUD (`CONFIG.statusEffects`), the applied ActiveEffect
 * (`createConditionEffect` / the HUD toggle), and the rules engine's view of a
 * bearer's active conditions ({@link activeConditionMechanics}). Direction #7:
 * no condition's name, artwork, modifier or behaviour is written here — they are
 * the documents' `name`, `img`, `system.modifiers` and the structured
 * `system.targeted` / `helplessTarget` / `actionLimit` / `autoFail` / `tick`.
 *
 * **Loading.** Compendium documents load asynchronously, but the HUD reads
 * `CONFIG.statusEffects` synchronously. So at `ready` {@link loadConditionCatalog}
 * reads each condition pack's INDEX with the condition fields
 * ({@link CONDITION_INDEX_FIELDS}) — one small request per condition pack, no full
 * document load — and keeps the RAW per-line payloads in memory. Index payloads
 * are the stored source, NOT the world-line-flattened DataModel, so a
 * `{dh2: …, rt: …}` container survives and is collapsed to the BEARER's line at
 * application time ({@link resolveCondition}). Everything downstream (status
 * list, effect payload, mechanics) is then synchronous. Until `ready` only
 * Foundry's core `dead` marker is registered.
 *
 * **Keying.** One catalog entry per `system.identifier` (the status id), carrying
 * every pack's copy. A world may run several lines; the copy from the bearer's
 * own line pack wins, then a line-agnostic (homebrew) copy, then the first.
 *
 * A LEAF by design: `documents/base-actor.ts` needs the pure payload builder, and
 * `rules/active-effects.ts` (the impure writer hub) sits inside a large import
 * cycle — reaching the builder through the hub closed a depcruise `no-circular`
 * loop (#495).
 */

import { DEAD_STATUS_ID, SYSTEM_ID } from '../constants.ts';
import { normalizeCharacteristicKey } from '../data/shared/characteristics.ts';
import { inferActiveGameLine, materializeItemVariants, normalizeGameLineKey, type SupportedLineKey } from '../utils/item-variant-utils.ts';
import {
    type ConditionMechanics,
    type ConditionMechanicsInput,
    coerceConditionMechanics,
    type RawRecord,
    type RawValue,
    uniqueConditionMechanics,
} from './condition-mechanics.ts';

/**
 * `CONST.ACTIVE_EFFECT_MODES.ADD`, as a literal. Module-scope consumers run under
 * vitest and headless tooling where the Foundry `CONST` global does not exist;
 * the value is fixed by Foundry's own enum and cannot drift.
 */
export const MODE_ADD = 2;

export type EffectChange = {
    key: string;
    mode: number;
    value: number | string;
};

/** A JSON-safe flag value. */
type EffectFlagValue = string | number | boolean | null | EffectFlagValue[] | { [key: string]: EffectFlagValue };
/** ActiveEffect flags, by module scope. */
type EffectFlags = Record<string, Record<string, EffectFlagValue>>;
/** The legacy round-based duration block the system writes (V14 migrates it). */
export type EffectDuration = { rounds?: number; startRound?: number; startTurn?: number; seconds?: number };

/** Per-application overrides of a condition / effect payload. */
export type EffectOptions = {
    name?: string;
    img?: string;
    duration?: EffectDuration;
    origin?: string;
    flags?: EffectFlags;
    changes?: EffectChange[];
};

export type EffectDataInput = {
    name: string;
    img?: string | undefined;
    changes?: EffectChange[] | undefined;
    disabled?: boolean | undefined;
    origin?: string | undefined;
    duration?: EffectDuration | undefined;
    flags?: EffectFlags | undefined;
    /**
     * Foundry status ids this effect confers (#495). Setting it is what makes an
     * ActiveEffect a *status*: it drives the token status icon and membership in
     * `actor.statuses`, which the rules engine reads.
     */
    statuses?: string[] | undefined;
};

/* -------------------------------------------- */
/*  ModifiersTemplate → ActiveEffect changes     */
/* -------------------------------------------- */

/** The ActiveEffect key a characteristic modifier writes (full schema key). */
export function characteristicChangeKey(characteristic: string): string {
    return `system.characteristics.${characteristic}.modifier`;
}

/** The ActiveEffect key a skill modifier writes. */
export function skillChangeKey(skill: string): string {
    return `system.skills.${skill}.bonus`;
}

/** The ActiveEffect key a combat-stat modifier writes. */
export function combatChangeKey(stat: string): string {
    return `system.combat.${stat}`;
}

function isRawRecord(value: RawValue): value is RawRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Non-zero numeric entries of an authored modifier bucket. */
function numericEntries(bucket: RawValue): Array<[string, number]> {
    if (!isRawRecord(bucket)) return [];
    const out: Array<[string, number]> = [];
    for (const [key, value] of Object.entries(bucket)) {
        if (typeof value === 'number' && Number.isFinite(value) && value !== 0) out.push([key, value]);
    }
    return out;
}

/**
 * Project a (line-resolved) `ModifiersTemplate` block into ActiveEffect `changes`:
 * `characteristics` (full keys or short codes, any case) → `.modifier`, `skills` →
 * `.bonus`, `combat` → the combat stat. Zero / non-numeric entries and unknown
 * characteristic keys contribute nothing.
 * @param {RawValue} modifiers  The condition's `system.modifiers`, collapsed to one line.
 * @returns {EffectChange[]}  The derived changes.
 */
export function modifiersToEffectChanges(modifiers: RawValue): EffectChange[] {
    if (!isRawRecord(modifiers)) return [];
    const changes: EffectChange[] = [];
    for (const [key, value] of numericEntries(modifiers['characteristics'])) {
        const full = normalizeCharacteristicKey(key);
        if (full !== null) changes.push({ key: characteristicChangeKey(full), mode: MODE_ADD, value });
    }
    for (const [key, value] of numericEntries(modifiers['skills'])) changes.push({ key: skillChangeKey(key), mode: MODE_ADD, value });
    for (const [key, value] of numericEntries(modifiers['combat'])) changes.push({ key: combatChangeKey(key), mode: MODE_ADD, value });
    return changes;
}

/* -------------------------------------------- */
/*  Catalog                                     */
/* -------------------------------------------- */

/** One pack's copy of a condition, as read from the pack index. */
type ConditionSource = {
    uuid: string;
    /** The pack's game line (from its `<line>-…` name), or null for a line-agnostic pack. */
    line: SupportedLineKey | null;
    name: string;
    img: string;
    /** The RAW stored `system` payload (per-line containers intact). */
    system: RawRecord;
};

/** Every pack's copy of one condition, keyed by status id. */
type ConditionCatalogEntry = {
    id: string;
    sources: ConditionSource[];
};

/** A condition pack index row, as `CompendiumCollection#getIndex` returns it. */
export type ConditionIndexRow = {
    _id?: string | undefined;
    uuid?: string | undefined;
    name?: string | undefined;
    img?: string | null | undefined;
    type?: string | undefined;
    system?: RawRecord | undefined;
};

/** The index fields the catalog needs beyond Foundry's defaults (name / img / type). */
const CONDITION_INDEX_FIELDS: readonly string[] = [
    'system.identifier',
    'system.nature',
    'system.modifiers',
    'system.targeted',
    'system.helplessTarget',
    'system.actionLimit',
    'system.autoFail',
    'system.tick',
    'system.removal',
    'system.source',
];

/** The game line a pack belongs to, from its `<line>-…` name prefix. */
export function packLine(packName: string): SupportedLineKey | null {
    return normalizeGameLineKey(packName.split('-')[0] ?? '');
}

/**
 * Build the catalog from pack index rows. Pure.
 * @param {Array<{packName: string, rows: Iterable<ConditionIndexRow>}>} packs  Each condition pack's index.
 * @returns {Map<string, ConditionCatalogEntry>}  Catalog keyed by status id.
 */
export function buildConditionCatalog(packs: Iterable<{ packName: string; rows: Iterable<ConditionIndexRow> }>): Map<string, ConditionCatalogEntry> {
    const built = new Map<string, ConditionCatalogEntry>();
    for (const { packName, rows } of packs) {
        const line = packLine(packName);
        for (const row of rows) {
            if (row.type !== 'condition' || row.system === undefined) continue;
            const identifier = row.system['identifier'];
            if (typeof identifier !== 'string' || identifier.trim() === '') continue;
            const id = identifier.trim();
            const source: ConditionSource = {
                uuid: row.uuid ?? '',
                line,
                name: row.name ?? id,
                img: row.img ?? '',
                system: row.system,
            };
            const existing = built.get(id);
            if (existing === undefined) built.set(id, { id, sources: [source] });
            else existing.sources.push(source);
        }
    }
    return built;
}

let catalog: ReadonlyMap<string, ConditionCatalogEntry> = new Map();

/** Install a catalog (the `ready` loader, unit tests, stories). */
export function setConditionCatalog(next: ReadonlyMap<string, ConditionCatalogEntry>): void {
    catalog = next;
}

/** The copy of a condition to use for a bearer of `line`: own line, then line-agnostic, then first. */
function pickSource(entry: ConditionCatalogEntry, line: SupportedLineKey): ConditionSource | undefined {
    return entry.sources.find((s) => s.line === line) ?? entry.sources.find((s) => s.line === null) ?? entry.sources[0];
}

/** A condition resolved for one game line. */
type ResolvedCondition = {
    id: string;
    name: string;
    img: string;
    nature: string;
    /** The `system` payload collapsed to the line (per-line containers resolved). */
    system: RawRecord;
};

/**
 * Resolve a catalog condition for a game line, or null when the id is unknown.
 * @param {string} id  The status id.
 * @param {SupportedLineKey} line  The bearer's game line.
 * @returns {ResolvedCondition | null}  The line-resolved condition.
 */
export function resolveCondition(id: string, line: SupportedLineKey): ResolvedCondition | null {
    const entry = catalog.get(id);
    if (entry === undefined) return null;
    const source = pickSource(entry, line);
    if (source === undefined) return null;
    const system: RawRecord = structuredClone(source.system);
    materializeItemVariants(system, line);
    const nature = system['nature'];
    return { id, name: source.name, img: source.img, nature: typeof nature === 'string' && nature !== '' ? nature : 'neutral', system };
}

/** The line-resolved mechanics of one catalog condition, or null when unknown. */
export function conditionMechanicsFor(id: string, line: SupportedLineKey): ConditionMechanics | null {
    const resolved = resolveCondition(id, line);
    return resolved === null ? null : coerceConditionMechanics(id, resolved.name, resolved.system);
}

/* -------------------------------------------- */
/*  Core `dead` marker                          */
/* -------------------------------------------- */

/** A `CONFIG.statusEffects` row. */
type StatusEffectEntry = { id: string; name: string; img: string };

/**
 * Foundry core's own `dead` status, captured from `CONFIG.statusEffects` before the
 * defaults are replaced. Not a book condition: a token marker with no stat effect,
 * kept because `CONFIG.specialStatusEffects.DEFEATED` and the #477 death-loot hook
 * key off it.
 */
let coreDeadStatus: StatusEffectEntry | null = null;

/**
 * Capture core's `dead` status row from the default status list (call before
 * {@link registerConditionStatusEffects} replaces it).
 * @param {Iterable<{id?: string, name?: string, img?: string}>} defaults  `CONFIG.statusEffects` as shipped.
 */
export function captureCoreDeadStatus(defaults: Iterable<{ id?: string | undefined; name?: string | undefined; img?: string | null | undefined }>): void {
    for (const row of defaults) {
        if (row.id === DEAD_STATUS_ID) {
            coreDeadStatus = { id: DEAD_STATUS_ID, name: row.name ?? DEAD_STATUS_ID, img: row.img ?? '' };
            return;
        }
    }
}

/** Localise a label through `game.i18n` when booted; tests and tooling get the key back. */
function localize(key: string): string {
    return typeof game === 'undefined' ? key : game.i18n.localize(key);
}

/* -------------------------------------------- */
/*  Projections                                 */
/* -------------------------------------------- */

/** Merge per-application flags over the base, one scope deep. */
function mergeFlags(base: EffectFlags, extra: EffectFlags | undefined): EffectFlags {
    const out: EffectFlags = {};
    for (const [scope, values] of Object.entries(base)) out[scope] = { ...values };
    for (const [scope, values] of Object.entries(extra ?? {})) out[scope] = { ...(out[scope] ?? {}), ...values };
    return out;
}

/**
 * The ActiveEffect creation payload for a condition — the PURE builder every
 * writer uses (the HUD toggle, `createConditionEffect`, the effect dialog, fatigue
 * automation, death), so a condition is one document with one id, one artwork and
 * one set of `changes`. Name, artwork and changes come from the condition document
 * resolved for the bearer's line; the changes are derived from its
 * `system.modifiers` by {@link modifiersToEffectChanges}.
 * @param {string} condition  The status id.
 * @param {SupportedLineKey} line  The bearer's game line.
 * @param {EffectOptions} [options]  Per-application overrides (name, extra flags, duration…).
 * @returns {EffectDataInput | null}  The payload, or null when the id is unknown.
 */
export function conditionEffectData(condition: string, line: SupportedLineKey, options: EffectOptions = {}): EffectDataInput | null {
    if (condition === DEAD_STATUS_ID) {
        if (coreDeadStatus === null) return null;
        return {
            ...options,
            name: options.name ?? localize(coreDeadStatus.name),
            img: options.img ?? coreDeadStatus.img,
            changes: options.changes ?? [],
            flags: mergeFlags({ [SYSTEM_ID]: { nature: 'harmful' } }, options.flags),
            statuses: [DEAD_STATUS_ID],
        };
    }
    const resolved = resolveCondition(condition, line);
    if (resolved === null) return null;
    return {
        ...options,
        name: options.name ?? resolved.name,
        img: options.img ?? resolved.img,
        changes: options.changes ?? modifiersToEffectChanges(resolved.system['modifiers']),
        flags: mergeFlags({ [SYSTEM_ID]: { nature: resolved.nature } }, options.flags),
        // `statuses` is what makes an ActiveEffect a STATUS (#495): the token status
        // icon and membership in `actor.statuses`. The catalog key IS the status id.
        statuses: [condition],
    };
}

/** Picker rows (the effect-creation dialog) — one per catalog condition, resolved for `line`. */
export function conditionPickerRows(line: SupportedLineKey): Array<{ id: string; name: string; img: string; nature: string }> {
    const rows: Array<{ id: string; name: string; img: string; nature: string }> = [];
    for (const id of catalog.keys()) {
        const resolved = resolveCondition(id, line);
        if (resolved !== null) rows.push({ id, name: resolved.name, img: resolved.img, nature: resolved.nature });
    }
    return rows;
}

/**
 * The `CONFIG.statusEffects` rows: core's `dead` marker plus one row per catalog
 * condition, named and illustrated from the document for `line` (the world's line —
 * the HUD is not per-actor; the APPLIED effect is resolved per bearer by
 * `WH40KActiveEffect._fromStatusEffect`).
 */
export function conditionStatusEffects(line: SupportedLineKey): StatusEffectEntry[] {
    const rows: StatusEffectEntry[] = coreDeadStatus === null ? [] : [coreDeadStatus];
    for (const row of conditionPickerRows(line)) rows.push({ id: row.id, name: row.name, img: row.img });
    return rows;
}

/** The array surface of `CONFIG.statusEffects` the registration writes through. */
type StatusEffectTarget = { length: number; push: (...rows: StatusEffectEntry[]) => number };

/**
 * Replace the contents of `CONFIG.statusEffects` in place. V14 makes it a Proxy
 * that keeps an id-keyed lookup (`CONFIG.statusEffects[id]`, read by
 * `Actor#toggleStatusEffect` and `ActiveEffect.fromStatusEffect`) in step with the
 * array — REASSIGNING it with a plain array silently breaks that lookup, so it is
 * truncated and refilled instead.
 * @param {StatusEffectTarget} target  `CONFIG.statusEffects`.
 * @param {SupportedLineKey} line  The world's game line.
 */
export function registerConditionStatusEffects(target: StatusEffectTarget, line: SupportedLineKey): void {
    target.length = 0;
    target.push(...conditionStatusEffects(line));
}

/* -------------------------------------------- */
/*  Bearer → active mechanics                   */
/* -------------------------------------------- */

/** An owned item, as far as the condition reader looks at it. */
type OwnedItemLike = { type: string; name: string | null; system: object };

/** The minimal actor surface {@link activeConditionMechanics} reads. */
export type ConditionBearer = {
    /** The actor's system payload; its `gameSystem` selects the line conditions resolve for. */
    system?: object | undefined;
    /** Foundry's active status ids (`actor.statuses`; disabled effects excluded). */
    statuses?: Iterable<string> | null | undefined;
    items?: Iterable<OwnedItemLike> | null | undefined;
};

/** An owned item's system, narrowed to a condition payload. */
function isConditionSystem(system: object): system is ConditionMechanicsInput & { identifier: string } {
    return 'identifier' in system && typeof system.identifier === 'string' && system.identifier !== '';
}

/** The game line a bearer resolves conditions for (its own line, else the world's). */
export function bearerLine(actor: object | null | undefined): SupportedLineKey {
    return inferActiveGameLine({ actor });
}

/**
 * The bearer's active conditions, line-resolved: every catalog condition among its
 * status ids, plus every owned `condition` item. De-duplicated by identifier, so a
 * condition carried both ways is counted once.
 * @param {ConditionBearer} actor  The bearer.
 * @returns {ConditionMechanics[]}  Its active condition mechanics.
 */
export function activeConditionMechanics(actor: ConditionBearer | null | undefined): ConditionMechanics[] {
    if (actor === null || actor === undefined) return [];
    const line = bearerLine(actor);
    const found: ConditionMechanics[] = [];
    for (const status of actor.statuses ?? []) {
        const mechanics = conditionMechanicsFor(status, line);
        if (mechanics !== null) found.push(mechanics);
    }
    for (const item of actor.items ?? []) {
        if (item.type !== 'condition' || !isConditionSystem(item.system)) continue;
        found.push(coerceConditionMechanics(item.system.identifier, item.name ?? item.system.identifier, item.system));
    }
    return uniqueConditionMechanics(found);
}

/* -------------------------------------------- */
/*  Loader                                      */
/* -------------------------------------------- */

/** The compendium surface the loader reads. */
type ConditionPack = {
    documentName?: string | undefined;
    metadata: { name: string; packageName?: string | undefined };
    index: { size: number; values: () => Iterable<ConditionIndexRow> };
    getIndex: (options?: { fields?: string[] }) => Promise<{ values: () => Iterable<ConditionIndexRow> }>;
};

/**
 * Load the condition catalog from this system's Item packs. A pack is read with the
 * condition fields only when its default index shows a `condition` document, so
 * the cost is one small index request per condition pack. Call once on `ready`;
 * idempotent (rebuilds the catalog). A pack that fails to index is skipped.
 * @param {Iterable<ConditionPack>} packs  The world's compendium packs (`game.packs`).
 */
export async function loadConditionCatalog(packs: Iterable<ConditionPack>): Promise<void> {
    const candidates = [...packs].filter((pack) => pack.documentName === 'Item' && pack.metadata.packageName === SYSTEM_ID);
    const indexed = await Promise.all(
        candidates.map(async (pack) => {
            try {
                const base = pack.index.size > 0 ? pack.index : await pack.getIndex();
                if (![...base.values()].some((row) => row.type === 'condition')) return null;
                const full = await pack.getIndex({ fields: [...CONDITION_INDEX_FIELDS] });
                return { packName: pack.metadata.name, rows: [...full.values()] };
            } catch (error) {
                console.error(`${SYSTEM_ID} | condition catalog: failed indexing ${pack.metadata.name}`, error);
                return null;
            }
        }),
    );
    setConditionCatalog(buildConditionCatalog(indexed.filter((entry) => entry !== null)));
}
