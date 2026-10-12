/**
 * @file Pure domain logic for the campaign Event Tracker.
 *
 * The graph is authored in the vault, exported by `export_events.py` and loaded
 * from a GM-only JournalEntry by {@link EventTracker}. Everything in this module
 * is a pure function of that graph plus the tracker's stored state (resolved
 * events, campaign day, per-PC attitudes), so every rule the dashboard renders
 * is unit-testable without booting Foundry.
 *
 * Nothing here knows about Kanka or any other external sync target.
 */

/** A character-attribute predicate leaf (`{char: {skill: 'scrutiny'}}`), authored in the vault. */
export interface CharacterPredicate {
    readonly char: Readonly<Record<string, string | readonly string[]>>;
    readonly who?: string;
}

/** Every child must be satisfied. */
interface AllRequirement {
    readonly all: readonly RequirementNode[];
}

/** At least one child must be satisfied. */
interface AnyRequirement {
    readonly any: readonly RequirementNode[];
}

/**
 * A node of an event's requirement tree.
 * - `null`: no requirement (always satisfied)
 * - `string`: one event id
 * - `{all}` / `{any}`: grouping operators
 * - `{char}`: a character-attribute predicate. The tracker does not evaluate
 *   these (they are GM judgement), so they always read as unmet.
 */
export type RequirementNode = null | string | AllRequirement | AnyRequirement | CharacterPredicate;

/** One event of the graph, as `export_events.py` writes it. */
export interface EventDef {
    id?: string;
    name: string;
    location?: string | null;
    /** A single node, or a legacy list read as an implicit `all`. */
    requires?: RequirementNode | readonly RequirementNode[];
    /** Legacy flat OR, folded into the requirement tree by {@link normaliseRequirements}. */
    requires_any?: readonly RequirementNode[] | null;
    /** One excuse for the whole event, or one per required event id. */
    excuse?: string | Readonly<Record<string, string>> | null;
    is_day_end?: boolean;
    branch?: string | null;
    /** Wiki link to the side quest this event opens. */
    initiates_quest?: string | null;
    source_name?: string;
    source_file?: string;
}

export type EventGraph = Record<string, EventDef>;

/**
 * Who made a tracker change: the GM by hand, a sync adapter applying pulled
 * remote state, or an automatic completion trigger.
 */
export type ChangeOrigin = 'manual' | 'sync' | 'auto';

const CHANGE_ORIGINS: readonly ChangeOrigin[] = ['manual', 'sync', 'auto'];

/** When (and how) an event was resolved. Entries written before origins existed carry neither field. */
interface ResolvedEntry {
    resolvedAt: string;
    origin?: ChangeOrigin;
    /** Free-text provenance, e.g. which trigger fired. */
    detail?: string;
}

/** Resolved events keyed by event id. */
export type ResolvedState = Record<string, ResolvedEntry>;

/** Per-PC attitudes per NPC: `{ [npcName]: { [pcName]: attitude } }`. */
export type PcAttitudeMap = Record<string, Record<string, string>>;

export interface DispositionEntry {
    /** `party`, empty, or a character name. */
    target?: string;
    attitude: string;
    default?: boolean;
    trigger?: string;
    note?: string;
}

interface RelationshipInfluence {
    event: string;
    to: string;
    note?: string;
}

interface RelationshipEntry {
    target: string;
    type: string;
    state: string;
    summary?: string;
    is_private?: boolean;
    influences?: readonly RelationshipInfluence[];
}

export interface CharacterState {
    dispositions?: readonly DispositionEntry[];
    relationships?: readonly RelationshipEntry[];
    source_file?: string;
}

/** A relationship with its state recomputed from the resolved events. */
interface ComputedRelationship {
    target: string;
    type: string;
    currentState: string;
    summary?: string;
    trigger?: string;
}

/** The current disposition / relationship state of one character. */
export interface ComputedCharacterState {
    dispositions: Record<string, DispositionEntry>;
    relationships: ComputedRelationship[];
}

/** What a tracker name refers to, for resolving it to its Foundry journal. */
export type JournalRefKind = 'character' | 'location' | 'event-source' | 'quest' | 'item';

/** A named reference the dashboard wants to link to its journal. */
export interface JournalRef {
    readonly kind: JournalRefKind;
    readonly name: string;
}

/** Maps a reference to a JournalEntry / JournalEntryPage UUID, or null when it has none. */
export type JournalLinkResolver = (ref: JournalRef) => string | null;

/** The vault entity types a vault-written JournalEntry can carry (the vault's `entity_type`). */
export type VaultEntityType = 'character' | 'location' | 'item' | 'quest' | 'journal' | 'note';

/**
 * The vault identity the vault→Foundry journal writer stamps on every
 * JournalEntry as `flags['wh40k-rpg'].vault` — the entry's vault file path,
 * its entity type and its vault display name. It survives a GM renaming the
 * journal, so it is matched before the journal's own name.
 */
export interface VaultJournalIdentity {
    readonly path: string;
    readonly entityType: VaultEntityType;
    readonly name: string;
}

/** The fields of a journal document the built-in lookup reads. */
export interface NamedJournal {
    readonly name: string;
    readonly uuid: string;
    /** The vault identity flag, when the vault writer created this journal. */
    readonly vault?: VaultJournalIdentity | undefined;
}

/** The vault entity types that fit each reference kind, most preferred first. */
const VAULT_TYPES_FOR_KIND: Readonly<Record<JournalRefKind, readonly VaultEntityType[]>> = {
    'character': ['character'],
    'location': ['location'],
    'item': ['item'],
    'quest': ['quest'],
    'event-source': ['journal', 'quest'],
};

/** The disposition target that means "the whole party". */
const PARTY_TARGET = 'party';

/** Days numbered `M<n>` sort after every plain day; this offset keeps them contiguous. */
const MIDNIGHT_DAY_OFFSET = 100;

/** Sort key for a source whose name carries no day number — always last. */
export const UNDATED_SOURCE_SORT_KEY = 9999;

const DAY_SOURCE_PATTERN = /^Day\s+(M?\d+)/;
const WIKI_LINK_PATTERN = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/;

/**
 * Look a key up honestly: an absent (or inherited) key yields `undefined`.
 * Every map here is keyed by vault-authored names, so a lookup can always miss.
 */
export function lookup<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
    return Object.hasOwn(record, key) ? record[key] : undefined;
}

/** True when the event id is resolved. Own-key test, so `constructor` is never "resolved". */
export function isResolved(resolved: ResolvedState, eventId: string): boolean {
    return Object.hasOwn(resolved, eventId);
}

function isNodeList(value: RequirementNode | readonly RequirementNode[]): value is readonly RequirementNode[] {
    return Array.isArray(value);
}

/**
 * Fold an event's `requires` and legacy `requires_any` into one requirement node.
 * A list of `requires` is an implicit `all`; a non-empty `requires_any` adds an
 * `any` child that must hold alongside it.
 */
export function normaliseRequirements(event: Pick<EventDef, 'requires' | 'requires_any'>): RequirementNode {
    const children: RequirementNode[] = [];
    const requires = event.requires;
    if (requires !== undefined) {
        if (isNodeList(requires)) children.push(...requires);
        else if (requires !== null) children.push(requires);
    }
    const anyOf = event.requires_any;
    if (anyOf !== undefined && anyOf !== null && anyOf.length > 0) children.push({ any: anyOf });
    const only = children.at(0);
    if (only === undefined) return null;
    return children.length === 1 ? only : { all: children };
}

/** Whether a requirement node is satisfied by the resolved events. Predicates never are. */
export function evaluateRequirement(node: RequirementNode, resolved: ResolvedState): boolean {
    if (node === null) return true;
    if (typeof node === 'string') return isResolved(resolved, node);
    if ('all' in node) return node.all.every((child) => evaluateRequirement(child, resolved));
    if ('any' in node) return node.any.some((child) => evaluateRequirement(child, resolved));
    return false;
}

/** Whether an event's prerequisites are met. An unknown id is never available. */
export function isEventAvailable(graph: EventGraph, resolved: ResolvedState, eventId: string): boolean {
    const event = lookup(graph, eventId);
    if (event === undefined) return false;
    return evaluateRequirement(normaliseRequirements(event), resolved);
}

/** One line of a flattened requirement tree, in display order. */
export type RequirementRow =
    | { kind: 'all' | 'any'; depth: number }
    | { kind: 'event'; depth: number; eventId: string; met: boolean }
    | { kind: 'predicate'; depth: number; criteria: PredicateCriterion[] };

/** One dimension of a character predicate, e.g. `skill` → `[scrutiny, logic]`. */
export interface PredicateCriterion {
    dimension: string;
    values: string[];
}

/** The tested dimensions of a predicate (its `who` metadata excluded). */
export function predicateCriteria(predicate: CharacterPredicate): PredicateCriterion[] {
    return Object.entries(predicate.char)
        .filter(([dimension]) => dimension !== 'who')
        .map(([dimension, value]) => ({ dimension, values: typeof value === 'string' ? [value] : [...value] }));
}

/** Flatten a requirement tree depth-first into rows, so a template can render it without recursion. */
export function flattenRequirements(node: RequirementNode, resolved: ResolvedState, depth = 0): RequirementRow[] {
    if (node === null) return [];
    if (typeof node === 'string') return [{ kind: 'event', depth, eventId: node, met: isResolved(resolved, node) }];
    if ('all' in node) return [{ kind: 'all', depth }, ...node.all.flatMap((child) => flattenRequirements(child, resolved, depth + 1))];
    if ('any' in node) return [{ kind: 'any', depth }, ...node.any.flatMap((child) => flattenRequirements(child, resolved, depth + 1))];
    return [{ kind: 'predicate', depth, criteria: predicateCriteria(node) }];
}

/** The day number a source is named for (`Day 3 — …` → 3, `Day M2 — …` → 102), or null. */
export function sourceDayNumber(source: string): number | null {
    const day = DAY_SOURCE_PATTERN.exec(source)?.[1];
    if (day === undefined) return null;
    return day.startsWith('M') ? MIDNIGHT_DAY_OFFSET + Number.parseInt(day.slice(1), 10) : Number.parseInt(day, 10);
}

/** Chronological sort key for a source: its day number, or {@link UNDATED_SOURCE_SORT_KEY}. */
export function sourceSortKey(source: string): number {
    return sourceDayNumber(source) ?? UNDATED_SOURCE_SORT_KEY;
}

/** Order sources chronologically, undated (and unnamed) sources last, ties by name. */
export function compareSources(a: string, b: string): number {
    const byDay = sourceSortKey(a) - sourceSortKey(b);
    if (byDay !== 0) return byDay;
    if ((a === '') !== (b === '')) return a === '' ? 1 : -1;
    return a.localeCompare(b);
}

/** The `Day 3` prefix of a day-plan source (`Day 3 — Records` → `Day 3`), or null for any other source. */
export function sourceDayLabel(source: string): string | null {
    if (DAY_SOURCE_PATTERN.exec(source) === null) return null;
    return (source.split('—').at(0) ?? source).trim();
}

/** The plain name inside a wiki link (`[[Target|Shown]]` → `Target`); other text is trimmed. */
export function stripWikiLink(value: string): string {
    return WIKI_LINK_PATTERN.exec(value)?.[1]?.trim() ?? value.trim();
}

/** The source an event was authored in (day plan or quest), or '' when unrecorded. */
export function eventSourceName(event: EventDef): string {
    if (event.source_name !== undefined && event.source_name !== '') return event.source_name;
    return event.source_file ?? '';
}

/** The plain location name of an event, or '' when it has none. */
export function eventLocationName(event: EventDef): string {
    return event.location === undefined || event.location === null ? '' : stripWikiLink(event.location);
}

/** The split of a campaign day into its label parts: `M<n>` days are the offset range. */
export function campaignDayParts(day: number): { midnight: boolean; number: number } {
    return day >= MIDNIGHT_DAY_OFFSET ? { midnight: true, number: day - MIDNIGHT_DAY_OFFSET } : { midnight: false, number: day };
}

/** Step the campaign day by `delta`, never below day 0. */
export function stepCampaignDay(day: number, delta: number): number {
    return Math.max(0, day + delta);
}

/** True for a storable campaign day: a non-negative integer. */
export function isValidCampaignDay(day: number): boolean {
    return Number.isInteger(day) && day >= 0;
}

/** True when a disposition targets the whole party (an empty target means the party). */
export function isPartyDisposition(entry: DispositionEntry): boolean {
    return entry.target === undefined || entry.target === '' || entry.target === PARTY_TARGET;
}

function hasTrigger(entry: DispositionEntry): entry is DispositionEntry & { trigger: string } {
    return entry.trigger !== undefined && entry.trigger !== '';
}

/**
 * The disposition in force: the LAST entry (in authored order) whose trigger
 * event is resolved; else the `default` entry; else the first entry.
 */
export function activeDisposition(entries: readonly DispositionEntry[], resolved: ResolvedState): DispositionEntry | undefined {
    const triggered = entries.filter((entry) => hasTrigger(entry) && isResolved(resolved, entry.trigger)).at(-1);
    return triggered ?? entries.find((entry) => entry.default === true) ?? entries.at(0);
}

/** The next authored shift after the active entry whose trigger has not fired yet. */
export function nextDispositionShift(
    entries: readonly DispositionEntry[],
    active: DispositionEntry,
    resolved: ResolvedState,
): (DispositionEntry & { trigger: string }) | undefined {
    const after = entries.slice(entries.indexOf(active) + 1);
    return after.find((entry): entry is DispositionEntry & { trigger: string } => hasTrigger(entry) && !isResolved(resolved, entry.trigger));
}

/**
 * The current disposition (per target) and relationship state of every
 * character, recomputed from the resolved events.
 *
 * Dispositions are grouped by target (`party` for an empty target) and each
 * group resolves through {@link activeDisposition}. Relationships walk their
 * `influences` in order; the last influence whose event is resolved sets the
 * state, else the authored `state` stands.
 */
export function computeCharacterStates(characters: Readonly<Record<string, CharacterState>>, resolved: ResolvedState): Record<string, ComputedCharacterState> {
    const out: Record<string, ComputedCharacterState> = {};
    for (const [name, data] of Object.entries(characters)) {
        const byTarget = new Map<string, DispositionEntry[]>();
        for (const entry of data.dispositions ?? []) {
            const target = isPartyDisposition(entry) ? PARTY_TARGET : entry.target ?? PARTY_TARGET;
            byTarget.set(target, [...(byTarget.get(target) ?? []), entry]);
        }
        const dispositions: Record<string, DispositionEntry> = {};
        for (const [target, entries] of byTarget) {
            const active = activeDisposition(entries, resolved);
            if (active !== undefined) dispositions[target] = active;
        }

        const relationships = (data.relationships ?? []).map((relationship): ComputedRelationship => {
            const fired = (relationship.influences ?? []).filter((influence) => isResolved(resolved, influence.event)).at(-1);
            return {
                target: relationship.target,
                type: relationship.type,
                currentState: fired?.to ?? relationship.state,
                ...(relationship.summary !== undefined ? { summary: relationship.summary } : {}),
                ...(fired !== undefined ? { trigger: fired.event } : {}),
            };
        });
        out[name] = { dispositions, relationships };
    }
    return out;
}

/** A copy of `record` without `key`. */
export function omitKey<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
    return Object.fromEntries(Object.entries(record).filter(([k]) => k !== key));
}

/**
 * The attitude map with one PC's attitude toward one NPC set. A blank attitude
 * clears the entry (the PC has "not met" the NPC), and an NPC left with no
 * attitudes is dropped, so the stored map never accumulates empty records.
 */
export function withPcAttitude(map: Readonly<PcAttitudeMap>, npc: string, pc: string, attitude: string): PcAttitudeMap {
    const value = attitude.trim();
    const current = lookup(map, npc) ?? {};
    const next = value === '' ? omitKey(current, pc) : { ...current, [pc]: value };
    if (Object.keys(next).length === 0) return omitKey(map, npc);
    return { ...map, [npc]: next };
}

/** A plain JSON object (not null, not an array). */
// eslint-disable-next-line no-restricted-syntax -- boundary: game.settings.get returns Foundry's untyped stored value; this guard is what narrows it
function isPlainObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Narrow a stored `event-tracker-state` setting value. */
// eslint-disable-next-line no-restricted-syntax -- boundary: game.settings.get returns Foundry's untyped stored value; this guard is what narrows it
export function isResolvedState(value: unknown): value is ResolvedState {
    return isPlainObject(value) && Object.values(value).every(isResolvedEntry);
}

// eslint-disable-next-line no-restricted-syntax -- boundary: one stored entry of the untyped setting value, narrowed here
function isResolvedEntry(entry: unknown): entry is ResolvedEntry {
    if (!isPlainObject(entry) || typeof entry['resolvedAt'] !== 'string') return false;
    const origin = entry['origin'];
    const detail = entry['detail'];
    return (origin === undefined || CHANGE_ORIGINS.some((known) => known === origin)) && (detail === undefined || typeof detail === 'string');
}

/** Narrow a stored `event-tracker-campaign-day` setting value. */
// eslint-disable-next-line no-restricted-syntax -- boundary: game.settings.get returns Foundry's untyped stored value; this guard is what narrows it
export function isStoredCampaignDay(value: unknown): value is number {
    return typeof value === 'number' && isValidCampaignDay(value);
}

/** Narrow a stored `event-tracker-pc-attitudes` setting value. */
// eslint-disable-next-line no-restricted-syntax -- boundary: game.settings.get returns Foundry's untyped stored value; this guard is what narrows it
export function isPcAttitudeMap(value: unknown): value is PcAttitudeMap {
    return (
        isPlainObject(value) && Object.values(value).every((npc) => isPlainObject(npc) && Object.values(npc).every((attitude) => typeof attitude === 'string'))
    );
}

/** The kind of journal an event's source is: a quest file, or a day plan. */
export function sourceRefKind(event: EventDef): JournalRefKind {
    return event.source_file?.startsWith('Quests/') === true ? 'quest' : 'event-source';
}

/** The UUID of the first journal whose name is exactly `name`, or null. */
export function findJournalUuidByName(journals: Iterable<NamedJournal>, name: string): string | null {
    if (name === '') return null;
    for (const journal of journals) {
        if (journal.name === name) return journal.uuid;
    }
    return null;
}

/**
 * The UUID of the journal whose vault identity names `ref`, or null.
 *
 * Among journals whose `vault.name` equals the reference name, one whose
 * entity type fits the reference kind wins (earlier types in
 * {@link VAULT_TYPES_FOR_KIND} first); with none fitting, the first name match.
 */
export function findJournalUuidByVaultIdentity(journals: Iterable<NamedJournal>, ref: JournalRef): string | null {
    if (ref.name === '') return null;
    const preferred = VAULT_TYPES_FOR_KIND[ref.kind];
    let best: { uuid: string; rank: number } | null = null;
    for (const journal of journals) {
        if (journal.vault?.name !== ref.name) continue;
        const typeRank = preferred.indexOf(journal.vault.entityType);
        const rank = typeRank === -1 ? preferred.length : typeRank;
        if (best === null || rank < best.rank) best = { uuid: journal.uuid, rank };
        if (rank === 0) break;
    }
    return best?.uuid ?? null;
}

/** The vault identity of the location journal named `location`, or null when no journal carries one. */
export function findLocationVaultIdentity(journals: Iterable<NamedJournal>, location: string): VaultJournalIdentity | null {
    if (location === '') return null;
    for (const journal of journals) {
        if (journal.vault?.entityType === 'location' && journal.vault.name === location) return journal.vault;
    }
    return null;
}

/** The fields of a Scene the location lookup reads. */
export interface LocatableScene {
    readonly name: string;
    /** The vault identity flag, when the vault writer (or the tracker, from a vault journal) created this scene. */
    readonly vault?: VaultJournalIdentity | undefined;
}

/** The location a scene stands for: its vault location name when flagged, else its own name. */
export function sceneLocationName(scene: LocatableScene): string {
    return scene.vault?.entityType === 'location' ? scene.vault.name : scene.name;
}

/**
 * The scene for a location: one whose vault identity flag names the location
 * (entity type `location`) wins, then one whose own name is the location.
 */
export function findSceneForLocation<T extends LocatableScene>(scenes: Iterable<T>, location: string): T | undefined {
    if (location === '') return undefined;
    const list = Array.from(scenes);
    return list.find((scene) => scene.vault?.entityType === 'location' && scene.vault.name === location) ?? list.find((scene) => scene.name === location);
}

/**
 * The built-in lookup: a vault-identity match first (see
 * {@link findJournalUuidByVaultIdentity}), then an exact journal-name match.
 */
export function findJournalUuid(journals: Iterable<NamedJournal>, ref: JournalRef): string | null {
    const list = Array.from(journals);
    return findJournalUuidByVaultIdentity(list, ref) ?? findJournalUuidByName(list, ref.name);
}

/** A usable resolver answer: a non-empty string. Anything else (including a JS caller's junk) is null. */
function usableUuid(uuid: string | null): string | null {
    return typeof uuid === 'string' && uuid !== '' ? uuid : null;
}

/**
 * Resolve a reference to a journal UUID. The registered resolver wins when it
 * answers; when there is none, or it returns null (or throws), the built-in
 * fallback is asked instead.
 */
export function resolveJournalUuid(ref: JournalRef, registered: JournalLinkResolver | null, fallback: JournalLinkResolver): string | null {
    if (ref.name === '') return null;
    if (registered !== null) {
        try {
            const uuid = usableUuid(registered(ref));
            if (uuid !== null) return uuid;
        } catch (err) {
            console.error(`EventTracker: journal link resolver failed for ${ref.kind} "${ref.name}"`, err);
        }
    }
    return usableUuid(fallback(ref));
}
