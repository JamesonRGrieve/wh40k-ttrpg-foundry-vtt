/**
 * @file Pure view-model builder for the Event Tracker dashboard.
 *
 * {@link buildEventTrackerView} turns a snapshot of the tracker's state into the
 * Handlebars context the dashboard templates render. It reads no Foundry
 * globals, so the dialog, its Storybook story and its unit tests all drive the
 * same function — every grouping, sort, highlight and link decision lives here.
 */

import {
    activeDisposition,
    type CharacterState,
    campaignDayParts,
    compareSources,
    computeCharacterStates,
    type EventDef,
    type EventGraph,
    eventLocationName,
    eventSourceName,
    flattenRequirements,
    isEventAvailable,
    isPartyDisposition,
    isResolved,
    type JournalRef,
    type JournalRefKind,
    lookup,
    nextDispositionShift,
    normaliseRequirements,
    type PcAttitudeMap,
    type RequirementRow,
    type ResolvedState,
    sourceDayLabel,
    sourceDayNumber,
    sourceRefKind,
    stripWikiLink,
} from '../../managers/event-graph.ts';

/** The dashboard's tabs, in display order. */
const EVENT_TRACKER_TABS =['timeline', 'location', 'relations'] as const;
export type EventTrackerTab = (typeof EVENT_TRACKER_TABS)[number];

const TAB_META: Record<EventTrackerTab, { labelKey: string; icon: string }> = {
    timeline: { labelKey: 'WH40K.EventTracker.Tab.Timeline', icon: 'fa-solid fa-clock' },
    location: { labelKey: 'WH40K.EventTracker.Tab.Location', icon: 'fa-solid fa-location-dot' },
    relations: { labelKey: 'WH40K.EventTracker.Tab.Relations', icon: 'fa-solid fa-users' },
};

/** Left padding per requirement-tree depth (literal classes so Tailwind's scan emits them). */
const REQUIREMENT_INDENT_CLASSES = ['tw-pl-6', 'tw-pl-9', 'tw-pl-12', 'tw-pl-16', 'tw-pl-20', 'tw-pl-24'] as const;

/** Badge colour per relationship / disposition state (the tracker's established palette). */
const STATE_TONE_CLASSES: Readonly<Record<string, string>> = {
    'ally': 'tw-text-[#2d6]',
    'friendly': 'tw-text-[#2d6]',
    'helpful': 'tw-text-[#2d6]',
    'neutral': 'tw-text-[#888]',
    'cautious-neutral': 'tw-text-[#aa8]',
    'wary': 'tw-text-[#c96]',
    'rival': 'tw-text-[#c96]',
    'enemy': 'tw-text-[#c66]',
    'hostile': 'tw-text-[#c66]',
    'enraged': 'tw-text-[#c44]',
    'missing': 'tw-text-[#68c]',
};
const DEFAULT_TONE_CLASS = 'tw-text-[#aaa]';

/** Narrow a `data-tab` attribute to a tab, falling back to the first tab. */
export function asEventTrackerTab(raw: string | undefined): EventTrackerTab {
    return EVENT_TRACKER_TABS.find((tab) => tab === raw) ?? 'timeline';
}

/** Tailwind class for a state badge. */
export function stateToneClass(state: string): string {
    return STATE_TONE_CLASSES[state] ?? DEFAULT_TONE_CLASS;
}

/** Tailwind indent class for a requirement-tree depth (deep trees share the deepest indent). */
export function requirementIndentClass(depth: number): string {
    return REQUIREMENT_INDENT_CLASSES[Math.min(depth, REQUIREMENT_INDENT_CLASSES.length - 1)] ?? 'tw-pl-6';
}

/** A name that renders as a Foundry content link when `uuid` resolved, else as plain text. */
interface JournalLinkView {
    label: string;
    uuid: string | null;
}

interface RequirementRowView {
    indentClass: string;
    isAll: boolean;
    isAny: boolean;
    isEvent: boolean;
    isPredicate: boolean;
    met: boolean;
    name: string;
    location: string;
    source: string;
    /** `Day 3` when the source is a day plan (rendered "on Day 3 or later"), else null. */
    sourceDay: string | null;
    excuse: string | null;
    /** Predicate text, e.g. `skill: scrutiny / logic`. */
    criteria: string;
}

interface EventRowView {
    id: string;
    name: string;
    resolved: boolean;
    /** Set when the event was resolved by an automatic trigger: its provenance detail ('' when none). */
    autoResolvedDetail: string | null;
    available: boolean;
    locked: boolean;
    /** The location (timeline tab) or source (location tab) column. */
    detail: JournalLinkView | null;
    isDayEnd: boolean;
    quest: JournalLinkView | null;
    requirements: RequirementRowView[];
    excuse: string | null;
}

export interface EventGroupView {
    /** Group key: the source name (timeline) or plain location name (location); '' for none. */
    key: string;
    title: JournalLinkView | null;
    /** Langpack key shown when the group has no title (no source / no location). */
    untitledKey: string;
    isCurrent: boolean;
    isFuture: boolean;
    isActiveScene: boolean;
    /** Location tab only: whether a Scene of this name exists to go to, or can be spawned. */
    sceneAction: 'go' | 'spawn' | null;
    resolvedCount: number;
    total: number;
    rows: EventRowView[];
}

interface RelationshipView {
    target: JournalLinkView;
    type: string;
    state: string;
    toneClass: string;
    triggerName: string | null;
    summary: string;
}

interface PcAttitudeView {
    pc: JournalLinkView;
    pcName: string;
    value: string;
    inputId: string;
}

interface NpcCardView {
    name: JournalLinkView;
    npcName: string;
    attitude: string | null;
    toneClass: string;
    note: string;
    triggerName: string | null;
    next: { attitude: string; triggerName: string } | null;
    relationships: RelationshipView[];
    pcs: PcAttitudeView[];
}

interface EventTrackerTabView {
    id: EventTrackerTab;
    labelKey: string;
    icon: string;
    active: boolean;
}

export interface EventTrackerView {
    activeTab: EventTrackerTab;
    tabs: EventTrackerTabView[];
    day: { value: number; midnight: boolean; number: number; canStepBack: boolean };
    stats: { resolved: number; total: number; available: number };
    groups: EventGroupView[];
    npcs: NpcCardView[];
    hasPcs: boolean;
}

export interface EventTrackerViewInput {
    graph: EventGraph;
    characters: Readonly<Record<string, CharacterState>> | null;
    resolved: ResolvedState;
    campaignDay: number;
    pcAttitudes: PcAttitudeMap;
    pcNames: readonly string[];
    activeTab: EventTrackerTab;
    /** Name of the active Scene ('' when none). */
    activeSceneName: string;
    /** Names of every Scene in the world. */
    sceneNames: ReadonlySet<string>;
    /** Resolves a named reference to a journal UUID, or null. */
    journalLink: (ref: JournalRef) => string | null;
}

interface Context {
    input: EventTrackerViewInput;
    link: (kind: JournalRefKind, name: string) => JournalLinkView;
}

function eventName(graph: EventGraph, id: string): string {
    return lookup(graph, id)?.name ?? id;
}

function requirementRowView(row: RequirementRow, event: EventDef, graph: EventGraph): RequirementRowView {
    const base: RequirementRowView = {
        indentClass: requirementIndentClass(row.depth),
        isAll: row.kind === 'all',
        isAny: row.kind === 'any',
        isEvent: row.kind === 'event',
        isPredicate: row.kind === 'predicate',
        met: false,
        name: '',
        location: '',
        source: '',
        sourceDay: null,
        excuse: null,
        criteria: '',
    };
    if (row.kind === 'predicate') {
        return { ...base, criteria: row.criteria.map((c) => `${c.dimension}: ${c.values.join(' / ')}`).join('; ') };
    }
    if (row.kind !== 'event') return base;
    const dep = lookup(graph, row.eventId);
    const source = dep === undefined ? '' : eventSourceName(dep);
    const excuses = event.excuse;
    const excuse =
        excuses !== undefined && excuses !== null && typeof excuses !== 'string' && Object.hasOwn(excuses, row.eventId) ? excuses[row.eventId] ?? null : null;
    return {
        ...base,
        met: row.met,
        name: dep?.name ?? row.eventId,
        location: dep === undefined ? '' : eventLocationName(dep),
        source,
        sourceDay: sourceDayLabel(source),
        excuse,
    };
}

function eventRowView(ctx: Context, id: string, event: EventDef, detailKind: 'location' | 'source'): EventRowView {
    const { graph, resolved } = ctx.input;
    const isDone = isResolved(resolved, id);
    const available = !isDone && isEventAvailable(graph, resolved, id);
    const locked = !isDone && !available;
    const location = eventLocationName(event);
    const source = eventSourceName(event);
    const detail =
        detailKind === 'location' ? (location === '' ? null : ctx.link('location', location)) : source === '' ? null : ctx.link(sourceRefKind(event), source);
    const quest =
        event.initiates_quest !== undefined && event.initiates_quest !== null && event.initiates_quest !== ''
            ? ctx.link('quest', stripWikiLink(event.initiates_quest))
            : null;
    const entry = lookup(resolved, id);
    return {
        id,
        name: event.name,
        resolved: isDone,
        autoResolvedDetail: entry?.origin === 'auto' ? entry.detail ?? '' : null,
        available,
        locked,
        detail,
        isDayEnd: event.is_day_end === true,
        quest,
        requirements: locked ? flattenRequirements(normaliseRequirements(event), resolved).map((row) => requirementRowView(row, event, graph)) : [],
        excuse: locked && typeof event.excuse === 'string' && event.excuse !== '' ? event.excuse : null,
    };
}

function groupEvents(graph: EventGraph, keyOf: (event: EventDef) => string): Map<string, Array<[string, EventDef]>> {
    const groups = new Map<string, Array<[string, EventDef]>>();
    for (const [id, event] of Object.entries(graph)) {
        const key = keyOf(event);
        groups.set(key, [...(groups.get(key) ?? []), [id, event]]);
    }
    return groups;
}

function countResolved(events: ReadonlyArray<[string, EventDef]>, resolved: ResolvedState): number {
    return events.filter(([id]) => isResolved(resolved, id)).length;
}

function timelineGroups(ctx: Context): EventGroupView[] {
    const { graph, resolved, campaignDay } = ctx.input;
    const groups = [...groupEvents(graph, eventSourceName)].sort(([a], [b]) => compareSources(a, b));
    return groups.map(([source, events]): EventGroupView => {
        const day = sourceDayNumber(source);
        const firstEvent = events.at(0);
        return {
            key: source,
            title: source === '' || firstEvent === undefined ? null : ctx.link(sourceRefKind(firstEvent[1]), source),
            untitledKey: 'WH40K.EventTracker.UnknownSource',
            isCurrent: day === campaignDay,
            isFuture: day !== null && day > campaignDay,
            isActiveScene: false,
            sceneAction: null,
            resolvedCount: countResolved(events, resolved),
            total: events.length,
            rows: events.map(([id, event]) => eventRowView(ctx, id, event, 'location')),
        };
    });
}

function locationGroups(ctx: Context): EventGroupView[] {
    const { graph, resolved, activeSceneName, sceneNames } = ctx.input;
    const hasAvailable = (events: ReadonlyArray<[string, EventDef]>): boolean =>
        events.some(([id]) => !isResolved(resolved, id) && isEventAvailable(graph, resolved, id));
    const rank = (name: string, events: ReadonlyArray<[string, EventDef]>): number => {
        if (name !== '' && name === activeSceneName) return 0;
        if (name === '') return 3;
        return hasAvailable(events) ? 1 : 2;
    };
    const groups = [...groupEvents(graph, eventLocationName)].sort(([a, ea], [b, eb]) => rank(a, ea) - rank(b, eb) || a.localeCompare(b));
    return groups.map(
        ([location, events]): EventGroupView => ({
            key: location,
            title: location === '' ? null : ctx.link('location', location),
            untitledKey: 'WH40K.EventTracker.NoLocation',
            isCurrent: false,
            isFuture: false,
            isActiveScene: location !== '' && location === activeSceneName,
            sceneAction: location === '' ? null : sceneNames.has(location) ? 'go' : 'spawn',
            resolvedCount: countResolved(events, resolved),
            total: events.length,
            rows: events.map(([id, event]) => eventRowView(ctx, id, event, 'source')),
        }),
    );
}

function npcCards(ctx: Context): NpcCardView[] {
    const { characters, graph, resolved, pcNames, pcAttitudes } = ctx.input;
    if (characters === null) return [];
    const triggerName = (id: string | undefined): string | null => (id === undefined || id === '' ? null : eventName(graph, id));
    const computed = computeCharacterStates(characters, resolved);
    return Object.keys(characters)
        .sort((a, b) => a.localeCompare(b))
        .map((name, npcIndex): NpcCardView => {
            const data = lookup(characters, name) ?? {};
            const party = (data.dispositions ?? []).filter(isPartyDisposition);
            const active = activeDisposition(party, resolved);
            const next = active === undefined ? undefined : nextDispositionShift(party, active, resolved);
            const attitudes = lookup(pcAttitudes, name) ?? {};
            return {
                name: ctx.link('character', name),
                npcName: name,
                attitude: active?.attitude ?? null,
                toneClass: stateToneClass(active?.attitude ?? ''),
                note: active?.note ?? '',
                triggerName: triggerName(active?.trigger),
                next: next === undefined ? null : { attitude: next.attitude, triggerName: eventName(graph, next.trigger) },
                relationships: (lookup(computed, name)?.relationships ?? []).map(
                    (relationship): RelationshipView => ({
                        target: ctx.link('character', relationship.target),
                        type: relationship.type,
                        state: relationship.currentState,
                        toneClass: stateToneClass(relationship.currentState),
                        triggerName: triggerName(relationship.trigger),
                        summary: relationship.summary ?? '',
                    }),
                ),
                pcs: pcNames.map((pc, pcIndex) => ({
                    pc: ctx.link('character', pc),
                    pcName: pc,
                    value: attitudes[pc] ?? '',
                    inputId: `wh40k-evt-attitude-${npcIndex}-${pcIndex}`,
                })),
            };
        });
}

/** Build the dashboard's template context from a snapshot of the tracker state. */
export function buildEventTrackerView(input: EventTrackerViewInput): EventTrackerView {
    const ctx: Context = {
        input,
        link: (kind, name) => ({ label: name, uuid: input.journalLink({ kind, name }) }),
    };
    const ids = Object.keys(input.graph);
    const groupsFor: Record<EventTrackerTab, () => EventGroupView[]> = {
        timeline: () => timelineGroups(ctx),
        location: () => locationGroups(ctx),
        relations: () => [],
    };
    return {
        activeTab: input.activeTab,
        tabs: EVENT_TRACKER_TABS.map((id) => ({ id, ...TAB_META[id], active: id === input.activeTab })),
        day: { value: input.campaignDay, ...campaignDayParts(input.campaignDay), canStepBack: input.campaignDay > 0 },
        stats: {
            resolved: ids.filter((id) => isResolved(input.resolved, id)).length,
            total: ids.length,
            available: ids.filter((id) => !isResolved(input.resolved, id) && isEventAvailable(input.graph, input.resolved, id)).length,
        },
        groups: groupsFor[input.activeTab](),
        npcs: input.activeTab === 'relations' ? npcCards(ctx) : [],
        hasPcs: input.pcNames.length > 0,
    };
}
