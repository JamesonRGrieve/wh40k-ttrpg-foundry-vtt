import { describe, expect, it } from 'vitest';
import {
    type AdventureScenario,
    type DocLookup,
    eventGraphId,
    isAdventureScenario,
    loadAdventureGraph,
    mergeGraphs,
    namespacedId,
    parseCompendiumUuid,
    type ResolvedDocRef,
    resolveDocRef,
} from './adventure-event-graph.ts';
import { autoResolutions, computeCharacterStates, createRefResolver, type EventDef, type EventGraph, isEventAvailable, lookup } from './event-graph.ts';

/** The loaded event with this id; fails the test when it is missing. */
function eventOf(events: EventGraph, id: string): EventDef {
    const event = lookup(events, id);
    if (event === undefined) throw new Error(`no event ${id}`);
    return event;
}

/** A flag payload narrowed to a scenario; fails the test when the guard rejects it. */
function asScenario<T>(value: T): AdventureScenario {
    if (!isAdventureScenario(value)) throw new Error('not an adventure scenario');
    return value;
}

const ACTOR = 'Compendium.wh40k-rpg.hb-dh2-ashford-actors-npcs.Actor.ashOrrinVael0001';
const ITEM = 'Compendium.wh40k-rpg.hb-dh2-ashford-items-gear.Item.ashLedgerItem001';

/** World documents by UUID, plus the compendium documents an import made them from. */
const WORLD = new Map<string, ResolvedDocRef>([
    ['JournalEntry.ashChapter000001', { name: 'Chapter 1 — Arrival', uuid: 'JournalEntry.ashChapter000001' }],
    ['JournalEntry.ashMillPlace0001', { name: 'Ashford Mill', uuid: 'JournalEntry.ashMillPlace0001' }],
    ['Actor.ashAdaVael000001', { name: 'Ada Vael', uuid: 'Actor.ashAdaVael000001' }],
]);
const IMPORTED = new Map<string, ResolvedDocRef>([[ACTOR, { name: 'Orrin Vael', uuid: 'Actor.ashOrrinVael0001' }]]);

const docLookup: DocLookup = {
    imported: (_documentName, _id, compendiumUuid) => IMPORTED.get(compendiumUuid) ?? null,
    byUuid: (uuid) => WORLD.get(uuid) ?? (uuid === ITEM ? { name: 'Mill Ledger', uuid } : null),
};

const SCENARIO: AdventureScenario = {
    id: 'ashford-mill',
    eventGraph: {
        events: {
            ARRIVE: { name: 'Arrive', source: { uuid: 'JournalEntry.ashChapter000001' }, day: 1, act: 1, requires: null },
            TALK: {
                name: 'Talk',
                source: { uuid: 'JournalEntry.ashChapter000001' },
                location: { uuid: 'JournalEntry.ashMillPlace0001' },
                requires: { all: ['ARRIVE', { any: ['GONE', { char: { skill: 'charm' } }] }] },
                requires_any: ['ARRIVE'],
                excuse: { ARRIVE: 'Not yet there.' },
                initiates_quest: { uuid: 'JournalEntry.ashChapter000001' },
            },
            GONE: {
                name: 'The Foreman Falls',
                location: { uuid: 'JournalEntry.missing00000001' },
                requires: ['TALK'],
                completion: [
                    { kind: 'actor-died', actor: { uuid: ACTOR } },
                    { kind: 'event-resolved', event: 'TALK', ignoreRequirements: true },
                    { kind: 'item-acquired', item: { uuid: ITEM } },
                ],
            },
        },
        characters: {
            foreman: {
                actor: { uuid: ACTOR },
                dispositions: [
                    { target: 'party', attitude: 'guarded', default: true },
                    { target: 'party', attitude: 'hostile', trigger: 'TALK' },
                    { target: { uuid: 'Actor.ashAdaVael000001' }, attitude: 'warm' },
                ],
                relationships: [
                    { target: { uuid: 'Actor.ashAdaVael000001' }, type: 'family', state: 'friendly', influences: [{ event: 'GONE', to: 'enemy' }] },
                ],
            },
        },
    },
};

describe('parseCompendiumUuid / resolveDocRef', () => {
    it('parses a Compendium UUID into its class and id, and nothing else', () => {
        expect(parseCompendiumUuid(ACTOR)).toEqual({ documentName: 'Actor', id: 'ashOrrinVael0001' });
        expect(parseCompendiumUuid('Actor.ashOrrinVael0001')).toBeNull();
        expect(parseCompendiumUuid(`${ACTOR}.Item.x`)).toBeNull();
    });

    it('prefers the world document an import made of a compendium reference', () => {
        expect(resolveDocRef({ uuid: ACTOR }, docLookup)).toEqual({ name: 'Orrin Vael', uuid: 'Actor.ashOrrinVael0001' });
    });

    it('falls back to the compendium document itself when the adventure is not imported', () => {
        expect(resolveDocRef({ uuid: ITEM }, docLookup)).toEqual({ name: 'Mill Ledger', uuid: ITEM });
    });

    it('resolves an adventure-internal reference as the world UUID it is', () => {
        expect(resolveDocRef({ uuid: 'JournalEntry.ashMillPlace0001' }, docLookup)).toEqual({ name: 'Ashford Mill', uuid: 'JournalEntry.ashMillPlace0001' });
        expect(resolveDocRef({ uuid: 'JournalEntry.missing00000001' }, docLookup)).toBeNull();
    });
});

describe('loadAdventureGraph', () => {
    const loaded = loadAdventureGraph(SCENARIO, 'The Ashford Mill', docLookup);

    it('namespaces every event id and every reference to one', () => {
        expect(Object.keys(loaded.events)).toEqual(['ashford-mill:ARRIVE', 'ashford-mill:TALK', 'ashford-mill:GONE']);
        const talk = eventOf(loaded.events, 'ashford-mill:TALK');
        // `requires` and `requires_any` fold into one tree; predicates are kept as authored.
        expect(talk.requires).toEqual({
            all: [{ all: ['ashford-mill:ARRIVE', { any: ['ashford-mill:GONE', { char: { skill: 'charm' } }] }] }, { any: ['ashford-mill:ARRIVE'] }],
        });
        expect(talk.requires_any).toBeUndefined();
        expect(talk.excuse).toEqual({ 'ashford-mill:ARRIVE': 'Not yet there.' });
        const gone = eventOf(loaded.events, 'ashford-mill:GONE');
        expect(gone.requires).toBe('ashford-mill:TALK');
        expect(gone.completion?.at(1)).toEqual({ kind: 'event-resolved', event: 'ashford-mill:TALK', ignoreRequirements: true });
    });

    it('flattens references to the resolved names, keeping their UUIDs as links', () => {
        expect(eventOf(loaded.events, 'ashford-mill:TALK')).toMatchObject({
            id: 'ashford-mill:TALK',
            graph: 'ashford-mill',
            source_name: 'Chapter 1 — Arrival',
            location: 'Ashford Mill',
            initiates_quest: 'Chapter 1 — Arrival',
            links: { source: 'JournalEntry.ashChapter000001', location: 'JournalEntry.ashMillPlace0001', quest: 'JournalEntry.ashChapter000001' },
        });
        expect(eventOf(loaded.events, 'ashford-mill:ARRIVE')).toMatchObject({ day: 1, act: 1, requires: null });
    });

    it('leaves an unresolved reference out, and files a source-less event under the adventure', () => {
        const gone = eventOf(loaded.events, 'ashford-mill:GONE');
        expect(gone.location).toBeNull();
        expect(gone.links).toBeUndefined();
        expect(gone.source_name).toBe('The Ashford Mill');
    });

    it('keys characters by namespace, labelled and linked by their actor, with event keys namespaced', () => {
        expect(loaded.characters).toEqual({
            'ashford-mill:foreman': {
                graph: 'ashford-mill',
                label: 'Orrin Vael',
                link: 'Actor.ashOrrinVael0001',
                dispositions: [
                    { target: 'party', attitude: 'guarded', default: true },
                    { target: 'party', attitude: 'hostile', trigger: 'ashford-mill:TALK' },
                    { target: 'Ada Vael', attitude: 'warm' },
                ],
                relationships: [
                    {
                        target: 'Ada Vael',
                        targetLink: 'Actor.ashAdaVael000001',
                        type: 'family',
                        state: 'friendly',
                        influences: [{ event: 'ashford-mill:GONE', to: 'enemy' }],
                    },
                ],
            },
        });
    });

    it('runs on the tracker’s own rules once loaded: availability, character states and completion triggers', () => {
        const resolved = { 'ashford-mill:ARRIVE': { resolvedAt: 'x' }, 'ashford-mill:TALK': { resolvedAt: 'x' } };
        expect(isEventAvailable(loaded.events, resolved, 'ashford-mill:GONE')).toBe(true);
        const foreman = lookup(computeCharacterStates(loaded.characters, resolved), 'ashford-mill:foreman');
        expect(lookup(foreman?.dispositions ?? {}, 'party')?.attitude).toBe('hostile');
        const orrin = { name: 'Orrin Vael', sources: [ACTOR, 'Actor.ashOrrinVael0001'], isPartyMember: false };
        const change = { kind: 'actor-status', actor: orrin, status: 'dead', change: 'gained' } as const;
        expect(
            autoResolutions(
                loaded.events,
                resolved,
                change,
                createRefResolver(() => []),
            ).map((hit) => hit.eventId),
        ).toEqual(['ashford-mill:GONE']);
    });

    it('drops a malformed trigger rather than hand it to the watcher', () => {
        const scenario = {
            id: 'x',
            eventGraph: { events: { A: { name: 'A', completion: [{ kind: 'actor-died' }, { kind: 'nope' }, { kind: 'event-resolved', event: 'A' }] } } },
        };
        expect(eventOf(loadAdventureGraph(asScenario(scenario), 'X', docLookup).events, 'x:A').completion).toEqual([{ kind: 'event-resolved', event: 'x:A' }]);
    });
});

describe('isAdventureScenario', () => {
    it('accepts a scenario with an event graph, with or without characters', () => {
        expect(isAdventureScenario({ id: 'a', eventGraph: { events: {} } })).toBe(true);
        expect(isAdventureScenario({ id: 'a', eventGraph: { events: {}, characters: null } })).toBe(true);
    });

    it('rejects a scenario without one, and an id that cannot namespace', () => {
        expect(isAdventureScenario({ id: 'a', scenes: [] })).toBe(false);
        expect(isAdventureScenario({ id: '', eventGraph: { events: {} } })).toBe(false);
        expect(isAdventureScenario({ id: 'a:b', eventGraph: { events: {} } })).toBe(false);
        expect(isAdventureScenario({ id: 'a', eventGraph: { events: [] } })).toBe(false);
        expect(isAdventureScenario({ id: 'a', eventGraph: { events: {}, characters: [] } })).toBe(false);
        expect(isAdventureScenario(null)).toBe(false);
    });
});

describe('mergeGraphs / namespacing helpers', () => {
    it('merges the campaign graph (ids unchanged) with namespaced adventure graphs', () => {
        const campaign = { events: { BRIEFING: { name: 'Briefing' } }, characters: { Varo: {} } };
        const adventure = loadAdventureGraph(SCENARIO, 'Ashford', docLookup);
        const merged = mergeGraphs([campaign, adventure]);
        expect(Object.keys(merged.events)).toEqual(['BRIEFING', 'ashford-mill:ARRIVE', 'ashford-mill:TALK', 'ashford-mill:GONE']);
        expect(Object.keys(merged.characters)).toEqual(['Varo', 'ashford-mill:foreman']);
        expect(mergeGraphs([])).toEqual({ events: {}, characters: {} });
    });

    it('reads a campaign event as graph "" and an adventure event as its scenario id', () => {
        expect(eventGraphId({})).toBe('');
        expect(eventGraphId({ graph: 'ashford-mill' })).toBe('ashford-mill');
        expect(namespacedId('ashford-mill', 'ARRIVE')).toBe('ashford-mill:ARRIVE');
    });
});
