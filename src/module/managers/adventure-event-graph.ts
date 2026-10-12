/**
 * @file Adventure event graphs (#592): load an imported Adventure's scenario
 * `eventGraph` into the Event Tracker beside the home campaign graph.
 *
 * An Adventure pack authors its graph on the GM JournalEntry page's
 * `flags['wh40k-rpg'].scenario.eventGraph`, in the tracker's own event shape
 * ({@link EventDef}) with every reference a {@link UuidRef}. Foundry's Adventure
 * import creates the GM journal in the world (`keepId`), so the tracker finds the
 * graph there, by flag.
 *
 * Several adventures and the campaign coexist in one flat tracker graph:
 * - every adventure event id becomes `<scenarioId>:<eventId>` (and every
 *   reference to it — requirements, excuses, `event-resolved` triggers,
 *   disposition triggers, relationship influences — is rewritten with it); the
 *   campaign graph keeps its ids, so its stored resolved state needs no migration;
 * - adventure characters are keyed `<scenarioId>:<key>`, labelled by their actor;
 * - each {@link UuidRef} is resolved to the imported world document (or, failing
 *   that, the compendium document) and flattened to its display name, with its
 *   UUID kept in `links` for the dashboard's journal links.
 *
 * Completion-trigger references stay UUIDs: the watcher matches a world document
 * by its own UUID or its `_stats.compendiumSource`, which the pack build stamps on
 * every copy it embeds into an Adventure.
 *
 * Everything here is pure; the Foundry lookups are injected ({@link DocLookup}).
 */

import {
    type CharacterState,
    COMPLETION_TRIGGER_FIELDS,
    type CompletionTrigger,
    type DispositionEntry,
    type EventDef,
    type EventGraph,
    isTriggerKind,
    normaliseRequirements,
    type RequirementNode,
    TRIGGER_OPTION_FIELDS,
    type UuidRef,
} from './event-graph.ts';

/** Joins a scenario id and a local event / character key. Forbidden in either part. */
const GRAPH_NAMESPACE_SEPARATOR = ':';

/** The graph id of the home campaign (its events carry no `graph`). */
export const CAMPAIGN_GRAPH_ID = '';

/** The scenario flag's event graph, as an adventure pack authors it. */
interface AdventureEventGraph {
    events: EventGraph<UuidRef>;
    characters?: Record<string, CharacterState<UuidRef>> | null;
}

/** The part of an adventure's scenario flag the tracker reads. */
export interface AdventureScenario {
    /** The scenario handle (unique within its line): the namespace of its events. */
    id: string;
    eventGraph: AdventureEventGraph;
}

/** A document a reference resolved to. */
export interface ResolvedDocRef {
    name: string;
    uuid: string;
}

/** The world lookups reference resolution needs. */
export interface DocLookup {
    /**
     * The world document of class `documentName` an Adventure import created from
     * the compendium document `compendiumUuid` (id `id`): the one whose
     * `_stats.compendiumSource` is that UUID, else the one with that id (Adventure
     * import keeps embedded ids). Null when the adventure was not imported.
     */
    imported: (documentName: string, id: string, compendiumUuid: string) => ResolvedDocRef | null;
    /** Any document by UUID — a world document, or a compendium index entry. */
    byUuid: (uuid: string) => ResolvedDocRef | null;
}

/** One loaded graph: events and characters in the tracker's flat, namespaced form. */
export interface LoadedGraph {
    events: EventGraph;
    characters: Record<string, CharacterState>;
}

/** One graph the tracker loaded, for the dashboard's source filter. */
export interface GraphSource {
    /** {@link CAMPAIGN_GRAPH_ID}, or the adventure's scenario id. */
    id: string;
    label: string;
}

/** A Compendium UUID's document class and id (`Compendium.<package>.<pack>.<Class>.<id>`), or null. */
export function parseCompendiumUuid(uuid: string): { documentName: string; id: string } | null {
    const parts = uuid.split('.');
    const documentName = parts.at(3);
    const id = parts.at(4);
    if (parts.length !== 5 || parts.at(0) !== 'Compendium' || documentName === undefined || id === undefined) return null;
    return { documentName, id };
}

/**
 * Resolve a reference to the document it names: for a Compendium UUID, the world
 * document the Adventure import made of it first; otherwise (or when the
 * adventure is not imported) the document the UUID itself names.
 */
export function resolveDocRef(ref: UuidRef, lookup: DocLookup): ResolvedDocRef | null {
    const compendium = parseCompendiumUuid(ref.uuid);
    if (compendium !== null) {
        const imported = lookup.imported(compendium.documentName, compendium.id, ref.uuid);
        if (imported !== null) return imported;
    }
    return lookup.byUuid(ref.uuid);
}

/** The namespaced id of an adventure's event or character. */
export function namespacedId(graphId: string, localId: string): string {
    return `${graphId}${GRAPH_NAMESPACE_SEPARATOR}${localId}`;
}

/** The graph an event belongs to: its adventure scenario id, or {@link CAMPAIGN_GRAPH_ID}. */
export function eventGraphId(entry: { graph?: string }): string {
    return entry.graph ?? CAMPAIGN_GRAPH_ID;
}

function namespaceRequirement(node: RequirementNode, ns: (id: string) => string): RequirementNode {
    if (node === null) return null;
    if (typeof node === 'string') return ns(node);
    if ('all' in node) return { all: node.all.map((child) => namespaceRequirement(child, ns)) };
    if ('any' in node) return { any: node.any.map((child) => namespaceRequirement(child, ns)) };
    return node;
}

function namespaceExcuse(excuse: EventDef<UuidRef>['excuse'], ns: (id: string) => string): EventDef['excuse'] {
    if (excuse === undefined || excuse === null || typeof excuse === 'string') return excuse;
    return Object.fromEntries(Object.entries(excuse).map(([id, text]) => [ns(id), text]));
}

function namespaceTrigger(trigger: CompletionTrigger, ns: (id: string) => string): CompletionTrigger {
    return trigger.kind === 'event-resolved' ? { ...trigger, event: ns(trigger.event) } : trigger;
}

/** A resolved reference's display name and link, or nothing when it does not resolve. */
interface FlatRef {
    name: string | null;
    link: string | undefined;
}

function flatten(ref: UuidRef | null | undefined, resolve: (ref: UuidRef) => ResolvedDocRef | null): FlatRef {
    if (ref === undefined || ref === null) return { name: null, link: undefined };
    const doc = resolve(ref);
    return doc === null ? { name: null, link: undefined } : { name: doc.name, link: doc.uuid };
}

function loadEvent(graphId: string, label: string, localId: string, event: EventDef<UuidRef>, resolve: (ref: UuidRef) => ResolvedDocRef | null): EventDef {
    const ns = (id: string): string => namespacedId(graphId, id);
    const source = flatten(event.source, resolve);
    const location = flatten(event.location, resolve);
    const quest = flatten(event.initiates_quest, resolve);
    const links = {
        ...(source.link !== undefined ? { source: source.link } : {}),
        ...(location.link !== undefined ? { location: location.link } : {}),
        ...(quest.link !== undefined ? { quest: quest.link } : {}),
    };
    // `requires` and `requires_any` fold into one tree, the form the tracker reads them in anyway.
    const requires = namespaceRequirement(normaliseRequirements(event), ns);
    const excuse = namespaceExcuse(event.excuse, ns);
    return {
        id: ns(localId),
        name: event.name,
        graph: graphId,
        // An event without a source journal groups under its adventure on the timeline.
        source_name: source.name ?? label,
        location: location.name,
        ...(quest.name !== null ? { initiates_quest: quest.name } : {}),
        requires,
        ...(excuse !== undefined ? { excuse } : {}),
        ...(event.is_day_end !== undefined ? { is_day_end: event.is_day_end } : {}),
        ...(event.branch !== undefined ? { branch: event.branch } : {}),
        ...(event.day !== undefined ? { day: event.day } : {}),
        ...(event.act !== undefined ? { act: event.act } : {}),
        ...(event.completion !== undefined ? { completion: event.completion.filter(isWellFormedTrigger).map((trigger) => namespaceTrigger(trigger, ns)) } : {}),
        ...(Object.keys(links).length > 0 ? { links } : {}),
    };
}

function loadCharacter(graphId: string, key: string, character: CharacterState<UuidRef>, resolve: (ref: UuidRef) => ResolvedDocRef | null): CharacterState {
    const ns = (id: string): string => namespacedId(graphId, id);
    const actor = flatten(character.actor, resolve);
    const dispositions = (character.dispositions ?? []).map((entry): DispositionEntry => {
        const { target, trigger, ...rest } = entry;
        const targetName = target === undefined || typeof target === 'string' ? target : flatten(target, resolve).name ?? target.uuid;
        return { ...rest, ...(targetName !== undefined ? { target: targetName } : {}), ...(trigger !== undefined ? { trigger: ns(trigger) } : {}) };
    });
    const relationships = (character.relationships ?? []).map((relationship) => {
        const target = flatten(relationship.target, resolve);
        return {
            ...relationship,
            target: target.name ?? relationship.target.uuid,
            ...(target.link !== undefined ? { targetLink: target.link } : {}),
            ...(relationship.influences !== undefined
                ? { influences: relationship.influences.map((influence) => ({ ...influence, event: ns(influence.event) })) }
                : {}),
        };
    });
    return {
        graph: graphId,
        label: actor.name ?? key,
        ...(actor.link !== undefined ? { link: actor.link } : {}),
        dispositions,
        relationships,
    };
}

/**
 * An adventure's graph in the tracker's namespaced form. `label` names the
 * adventure (the timeline group of events with no source journal).
 */
export function loadAdventureGraph(scenario: AdventureScenario, label: string, lookup: DocLookup): LoadedGraph {
    const resolve = (ref: UuidRef): ResolvedDocRef | null => resolveDocRef(ref, lookup);
    const events: EventGraph = {};
    for (const [localId, event] of Object.entries(scenario.eventGraph.events)) {
        events[namespacedId(scenario.id, localId)] = loadEvent(scenario.id, label, localId, event, resolve);
    }
    const characters: Record<string, CharacterState> = {};
    for (const [key, character] of Object.entries(scenario.eventGraph.characters ?? {})) {
        characters[namespacedId(scenario.id, key)] = loadCharacter(scenario.id, key, character, resolve);
    }
    return { events, characters };
}

/** Merge loaded graphs into one. Ids never collide: adventure ids are namespaced, the campaign's are not. */
export function mergeGraphs(graphs: readonly LoadedGraph[]): LoadedGraph {
    return graphs.reduce<LoadedGraph>(
        (merged, graph) => ({ events: { ...merged.events, ...graph.events }, characters: { ...merged.characters, ...graph.characters } }),
        { events: {}, characters: {} },
    );
}

/* -------------------------------------------- */
/*  Flag boundary                               */
/* -------------------------------------------- */

// eslint-disable-next-line no-restricted-syntax -- boundary: the scenario flag is an untyped Foundry document flag; this guard narrows it
function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * True for a trigger the evaluators can read: a known kind with every required
 * field and no field its kind does not declare. The pack build rejects anything
 * else; this keeps a hand-edited world flag from feeding the watcher a
 * malformed trigger.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: the trigger came from an untyped Foundry document flag; its shape is checked here, not trusted
function isWellFormedTrigger(trigger: unknown): trigger is CompletionTrigger {
    if (!isRecord(trigger)) return false;
    const kind = trigger['kind'];
    if (typeof kind !== 'string' || !isTriggerKind(kind)) return false;
    const fields = COMPLETION_TRIGGER_FIELDS[kind];
    const known = new Set<string>(['kind', ...fields.required, ...fields.optional, ...TRIGGER_OPTION_FIELDS]);
    return fields.required.every((field) => trigger[field] !== undefined) && Object.keys(trigger).every((field) => known.has(field));
}

/**
 * Narrow a journal page's `scenario` flag to an adventure scenario carrying an
 * event graph. A scenario without one (the scene graph alone) is not an error —
 * it simply contributes no events.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: the scenario flag is an untyped Foundry document flag; this guard narrows it
export function isAdventureScenario(value: unknown): value is AdventureScenario {
    if (!isRecord(value)) return false;
    const id = value['id'];
    const graph = value['eventGraph'];
    if (typeof id !== 'string' || id === '' || id.includes(GRAPH_NAMESPACE_SEPARATOR) || !isRecord(graph)) return false;
    const characters = graph['characters'];
    return isRecord(graph['events']) && (characters === undefined || characters === null || isRecord(characters));
}
