/**
 * @file elite-advances — a line's Elite Advances, found in its origin-path packs,
 * and the ones a character already owns (#684).
 *
 * An Elite Advance is an origin-path document at the `elite` step. The advancement
 * dialog sells them on its Elite Advances tab, which a line gets only when its
 * books print some. A line's elites are every elite-step document in its origin
 * packs, from every book; no pack registry lives in `src/`. An owned elite is
 * matched by the compendium document it was created from, so renaming the owned
 * item does not make it purchasable again.
 */

/** The origin-path step Elite Advances sit at. */
const ELITE_STEP = 'elite';

/** One origin-path document of the line, as its pack index gives it. */
export interface LineOriginEntry {
    uuid: string;
    name: string;
    system: object;
}

/**
 * An item the character owns, reduced to what identifies an owned elite: the compendium
 * document it was created from, as `_stats.compendiumSource` (the advancement dialog) or
 * the older `flags.core.sourceId` (the origin-path builder).
 */
export interface OwnedOriginItem {
    isOriginPath: boolean;
    system: object;
    _stats?: { compendiumSource?: string | null | undefined } | null | undefined;
    /** Read only for the legacy `core.sourceId`, which Foundry's own flag typing does not declare. */
    flags?: object | undefined;
}

/** The origin-path step a document or item's system data names, or `''`. Pure. */
function stepOf(system: object): string {
    return 'step' in system && typeof system.step === 'string' ? system.step : '';
}

/**
 * Whether a document belongs to `line`: its `gameSystems` (or single `gameSystem`)
 * name the line. A pack can hold a reference to another line's document (BC's
 * archetype pack references DH2's Psyker elite advance), and that document is not
 * one of this line's Elite Advances. A document naming no line is taken as its pack's. Pure.
 */
function isLineDocument(system: object, line: string): boolean {
    if ('gameSystems' in system && Array.isArray(system.gameSystems) && system.gameSystems.length > 0) return system.gameSystems.includes(line);
    if ('gameSystem' in system && typeof system.gameSystem === 'string' && system.gameSystem !== '') return system.gameSystem === line;
    return true;
}

/** `line`'s Elite Advances among the documents in its origin packs, in pack order. Pure. */
export function eliteEntries(entries: readonly LineOriginEntry[], line: string): LineOriginEntry[] {
    return entries.filter((entry) => stepOf(entry.system) === ELITE_STEP && isLineDocument(entry.system, line));
}

/** Whether `line`'s books print any Elite Advance, so the dialog shows its Elite Advances tab. Pure. */
export function lineHasEliteAdvances(entries: readonly LineOriginEntry[], line: string): boolean {
    return eliteEntries(entries, line).length > 0;
}

/** The compendium documents the character's owned elites were created from. Pure. */
export function ownedEliteSources(items: Iterable<OwnedOriginItem>): Set<string> {
    const sources = new Set<string>();
    for (const item of items) {
        const source = originSource(item);
        if (item.isOriginPath && stepOf(item.system) === ELITE_STEP && source !== '') sources.add(source);
    }
    return sources;
}

/** The compendium document an owned origin item was created from, or '' (see OwnedOriginItem). Pure. */
export function originSource(item: Pick<OwnedOriginItem, '_stats' | 'flags'>): string {
    const stamped = item._stats?.compendiumSource;
    if (typeof stamped === 'string' && stamped !== '') return stamped;
    const core = item.flags !== undefined && 'core' in item.flags ? item.flags.core : undefined;
    const legacy = core !== null && typeof core === 'object' && 'sourceId' in core ? core.sourceId : undefined;
    return typeof legacy === 'string' ? legacy : '';
}

/**
 * The Elite Advances the given origins grant at no XP cost: the union of their
 * `grants.elites` UUIDs (DH2's Mystic role grants the Psyker elite). Pure.
 */
export function grantedEliteSources(origins: Iterable<{ system: object }>): Set<string> {
    const granted = new Set<string>();
    for (const origin of origins) {
        const grants = 'grants' in origin.system ? origin.system.grants : undefined;
        const elites = grants !== null && typeof grants === 'object' && 'elites' in grants ? grants.elites : undefined;
        if (!Array.isArray(elites)) continue;
        for (const uuid of elites) if (typeof uuid === 'string' && uuid !== '') granted.add(uuid);
    }
    return granted;
}

/**
 * The XP an elite costs this character: its authored `xpCost`, or 0 when another of
 * the character's origins grants it (`granted`, from `grantedEliteSources`). Pure.
 * @param system   The elite's origin-path system data.
 * @param source   The compendium UUID the elite was created from ('' when unknown).
 * @param granted  The elites the character's origins grant.
 */
export function eliteCharge(system: object, source: string, granted: ReadonlySet<string>): number {
    return source !== '' && granted.has(source) ? 0 : eliteXpCost(system);
}

/** The XP an elite advance costs: its authored `xpCost`, 0 when it has none. Pure. */
export function eliteXpCost(system: object): number {
    return 'xpCost' in system && typeof system.xpCost === 'number' && system.xpCost > 0 ? system.xpCost : 0;
}

/** Whether an origin-path document or item sits at the Elite Advance step. Pure. */
export function isEliteStep(system: object): boolean {
    return stepOf(system) === ELITE_STEP;
}
