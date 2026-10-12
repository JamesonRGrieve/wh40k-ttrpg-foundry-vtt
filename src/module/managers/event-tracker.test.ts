/**
 * Guard test (#33): the event graph comes from a GM-ONLY document, never a
 * publicly-served file.
 *
 * The bug this locks down: the graph was fetched from
 * `systems/wh40k-rpg/events.json`. Foundry serves everything under `systems/`
 * to every authenticated client, so a player could fetch the whole graph —
 * every unfired event, every GM disposition note. The operator ruled the graph
 * GM-SECRET, and the only Foundry primitive that actually withholds data is
 * document ownership, so it lives in a JournalEntry with
 * `ownership.default = NONE`.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EVENT_GRAPH_FLAG, EVENT_TRACKER_HOOKS, EVENT_TRACKER_SETTINGS, EventTracker, type EventTrackerChangeContext, SCENARIO_FLAG } from './event-tracker.ts';

/** The hook context of a change made by hand (the default origin). */
const MANUAL: EventTrackerChangeContext = { origin: 'manual' };

const SYSTEM_ID = 'wh40k-rpg';
const MODULE_SOURCE = readFileSync(resolve(__dirname, 'event-tracker.ts'), 'utf8');

/** The flag payload `deploy.sh` writes, plus the malformed shapes under test. */
interface GraphFlag {
    version?: number;
    events?: Record<string, { id: string; name: string }>;
    characters?: Record<string, Record<string, never>>;
}

interface JournalStub {
    name: string;
    flags: Record<string, Record<string, GraphFlag>>;
}

/** A journal collection carrying the given entries (with no pages), shaped like Foundry's. */
function stubJournal(entries: JournalStub[]): void {
    vi.stubGlobal('game', { journal: entries.map((entry) => ({ ...entry, pages: [] })) });
}

function resetTracker(): void {
    EventTracker._graph = null;
    EventTracker._characters = null;
    EventTracker._dataVersion = 1;
    EventTracker._sources = [];
}

afterEach(() => {
    vi.unstubAllGlobals();
    resetTracker();
    vi.restoreAllMocks();
});

describe('EventTracker graph transport (#33)', () => {
    it('never fetches the graph from the publicly-served systems/ path', () => {
        // The whole point of the change: anything under systems/ is public, so a
        // `fetch` there hands players the GM-secret graph. Comments may narrate
        // the old path; a CALL must not exist.
        const calls = MODULE_SOURCE.split('\n').filter((line) => /^\s*(?!\*|\/\/).*\bfetch\(/.test(line));
        expect(calls).toEqual([]);
        expect(MODULE_SOURCE).not.toMatch(/fetch\(`systems\//);
    });

    it('loads the graph from a GM-only journal document', async () => {
        stubJournal([
            { name: 'Session Notes', flags: {} },
            {
                name: 'Campaign Event Graph (GM)',
                flags: { [SYSTEM_ID]: { [EVENT_GRAPH_FLAG]: { version: 3, events: { FOO: { id: 'FOO', name: 'Foo' } }, characters: { Varo: {} } } } },
            },
        ]);
        await EventTracker.loadGraph();
        expect(EventTracker.graph).toEqual({ FOO: { id: 'FOO', name: 'Foo' } });
        expect(EventTracker.characters).toEqual({ Varo: {} });
        expect(EventTracker.dataVersion).toBe(3);
    });

    it('finds the document by FLAG, not by name, so the GM may rename it', async () => {
        stubJournal([{ name: 'Whatever The GM Called It', flags: { [SYSTEM_ID]: { [EVENT_GRAPH_FLAG]: { events: { A: { id: 'A', name: 'A' } } } } } }]);
        await EventTracker.loadGraph();
        expect(EventTracker.graph).toEqual({ A: { id: 'A', name: 'A' } });
    });

    it('loads nothing on a player client, where the document is never delivered', async () => {
        // Foundry does not send a document the user cannot observe, so the
        // collection simply has no entry carrying the flag. That is the intended
        // outcome, not an error state.
        stubJournal([{ name: 'Session Notes', flags: {} }]);
        await EventTracker.loadGraph();
        expect(EventTracker.graph).toBeNull();
    });

    it('leaves the graph null when the document carries no usable events map', async () => {
        stubJournal([{ name: 'Campaign Event Graph (GM)', flags: { [SYSTEM_ID]: { [EVENT_GRAPH_FLAG]: { version: 3 } } } }]);
        await EventTracker.loadGraph();
        expect(EventTracker.graph).toBeNull();
    });

    it('defaults the schema version when the document omits it', async () => {
        stubJournal([{ name: 'Graph', flags: { [SYSTEM_ID]: { [EVENT_GRAPH_FLAG]: { events: {} } } } }]);
        await EventTracker.loadGraph();
        expect(EventTracker.dataVersion).toBe(1);
    });

    it('survives a world where the journal collection is not up yet', async () => {
        vi.stubGlobal('game', {});
        await expect(EventTracker.loadGraph()).resolves.toBeUndefined();
        expect(EventTracker.graph).toBeNull();
    });
});

describe('EventTracker adventure graphs (#592)', () => {
    const ACTOR_SOURCE = 'Compendium.wh40k-rpg.hb-dh2-ashford-actors-npcs.Actor.ashOrrinVael0001';

    /** A world document as the lookups read it. */
    interface DocStub {
        id: string;
        name: string;
        uuid: string;
        _stats: { compendiumSource: string | null };
    }

    const doc = (documentName: string, id: string, name: string, compendiumSource: string | null = null): DocStub => ({
        id,
        name,
        uuid: `${documentName}.${id}`,
        _stats: { compendiumSource },
    });

    /** A flag payload: plain JSON, as a world document stores it. */
    type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
    type JsonObject = { [key: string]: Json };

    /** A world journal entry and its pages, as the scan reads them. */
    interface JournalWithPages {
        name: string;
        flags: JsonObject;
        pages: Array<{ flags: JsonObject }>;
    }

    /** The scenario flag an imported adventure's GM journal page carries. */
    const scenario = (id: string): JsonObject => ({
        id,
        eventGraph: {
            events: {
                ARRIVE: { name: 'Arrive', source: { uuid: 'JournalEntry.ashChapter000001' }, day: 1 },
                FOREMAN_DOWN: {
                    name: 'The Foreman Falls',
                    source: { uuid: 'JournalEntry.ashChapter000001' },
                    location: { uuid: 'JournalEntry.ashMillPlace0001' },
                    requires: 'ARRIVE',
                    completion: [{ kind: 'actor-died', actor: { uuid: ACTOR_SOURCE } }, { kind: 'no-such-kind' }],
                },
            },
            characters: { foreman: { actor: { uuid: ACTOR_SOURCE }, dispositions: [{ target: 'party', attitude: 'hostile', trigger: 'ARRIVE' }] } },
        },
    });

    /** A world holding the campaign graph document, an imported adventure's journals, and its imported actor. */
    function stubWorldWithAdventure(journals: JournalWithPages[]): void {
        const journalDocs = [doc('JournalEntry', 'ashChapter000001', 'Chapter 1 — Arrival'), doc('JournalEntry', 'ashMillPlace0001', 'Ashford Mill')];
        const actors = [doc('Actor', 'ashOrrinVael0001', 'Orrin Vael', ACTOR_SOURCE)];
        const byUuid = new Map([...journalDocs, ...actors].map((entry) => [entry.uuid, entry]));
        vi.stubGlobal('game', {
            journal: Object.assign(journals, { contents: journalDocs }),
            actors: { contents: actors },
            items: { contents: [] },
            scenes: { contents: [] },
        });
        vi.stubGlobal('fromUuidSync', (uuid: string) => byUuid.get(uuid) ?? null);
    }

    const campaignJournal: JournalWithPages = {
        name: 'Campaign Graph',
        flags: { [SYSTEM_ID]: { [EVENT_GRAPH_FLAG]: { events: { BRIEFING: { id: 'BRIEFING', name: 'Briefing' } } } } },
        pages: [],
    };
    const adventureJournal = (id: string, name: string): JournalWithPages => ({
        name,
        flags: {},
        pages: [{ flags: {} }, { flags: { [SYSTEM_ID]: { [SCENARIO_FLAG]: scenario(id) } } }],
    });

    it('loads an imported adventure beside the campaign, namespaced, with the campaign ids unchanged', async () => {
        stubWorldWithAdventure([campaignJournal, adventureJournal('ashford-mill', 'The Ashford Mill — GM Guide')]);
        await EventTracker.loadGraph();
        expect(Object.keys(EventTracker.graph ?? {})).toEqual(['BRIEFING', 'ashford-mill:ARRIVE', 'ashford-mill:FOREMAN_DOWN']);
        expect(EventTracker.sources).toEqual([
            { id: '', label: '' },
            { id: 'ashford-mill', label: 'The Ashford Mill — GM Guide' },
        ]);
    });

    it('resolves references to the imported world documents and keeps only well-formed triggers', async () => {
        stubWorldWithAdventure([adventureJournal('ashford-mill', 'The Ashford Mill — GM Guide')]);
        await EventTracker.loadGraph();
        expect(EventTracker.graph?.['ashford-mill:FOREMAN_DOWN']).toMatchObject({
            graph: 'ashford-mill',
            source_name: 'Chapter 1 — Arrival',
            location: 'Ashford Mill',
            requires: 'ashford-mill:ARRIVE',
            links: { source: 'JournalEntry.ashChapter000001', location: 'JournalEntry.ashMillPlace0001' },
            completion: [{ kind: 'actor-died', actor: { uuid: ACTOR_SOURCE } }],
        });
        // The compendium actor reference resolves to the actor the import created from it.
        expect(EventTracker.characters?.['ashford-mill:foreman']).toMatchObject({
            label: 'Orrin Vael',
            link: 'Actor.ashOrrinVael0001',
            dispositions: [{ target: 'party', attitude: 'hostile', trigger: 'ashford-mill:ARRIVE' }],
        });
    });

    it('loads several adventures side by side, and only one graph per scenario id', async () => {
        stubWorldWithAdventure([
            adventureJournal('ashford-mill', 'Ashford'),
            adventureJournal('tower', 'Tower'),
            adventureJournal('ashford-mill', 'Ashford (duplicate import)'),
        ]);
        await EventTracker.loadGraph();
        expect(Object.keys(EventTracker.graph ?? {})).toEqual(['ashford-mill:ARRIVE', 'ashford-mill:FOREMAN_DOWN', 'tower:ARRIVE', 'tower:FOREMAN_DOWN']);
        expect(EventTracker.sources.map((source) => source.id)).toEqual(['ashford-mill', 'tower']);
    });

    it('reloads the graph when an adventure is imported', () => {
        const on = vi.fn();
        vi.stubGlobal('Hooks', { on });
        EventTracker.watchAdventureImports();
        expect(on).toHaveBeenCalledWith('importAdventure', expect.any(Function));
    });
});

/** In-memory world settings, keyed `<scope>.<key>`, shaped like `game.settings`. */
/** The JSON shapes the tracker's world settings hold (plus malformed values under test). */
type StoredValue = string | number | boolean | object | null | undefined;

interface SettingsStub {
    store: Map<string, StoredValue>;
    register: (scope: string, key: string, config: { default: StoredValue }) => void;
    get: (scope: string, key: string) => StoredValue;
    set: (scope: string, key: string, value: StoredValue) => Promise<StoredValue>;
}

function stubSettings(): SettingsStub {
    const store = new Map<string, StoredValue>();
    return {
        store,
        register: (scope, key, config) => {
            store.set(`${scope}.${key}`, config.default);
        },
        get: (scope, key) => store.get(`${scope}.${key}`),
        set: async (scope, key, value) => {
            store.set(`${scope}.${key}`, value);
            return Promise.resolve(value);
        },
    };
}

interface WorldStub {
    settings: SettingsStub;
    callAll: ReturnType<typeof vi.fn>;
}

/** A world with registered tracker settings, a (GM or player) user, journals, and a spied `Hooks.callAll`. */
/** A world journal entry, optionally carrying the vault writer's identity flag. */
interface WorldJournalStub {
    name: string;
    uuid: string;
    flags: { [SYSTEM_ID]?: { vault: { path: string; entityType: string; name: string } } };
}

function stubWorld(isGM = true, journals: WorldJournalStub[] = []): WorldStub {
    const settings = stubSettings();
    const callAll = vi.fn();
    vi.stubGlobal('game', { settings, user: { isGM }, journal: journals, i18n: { localize: (key: string) => key } });
    vi.stubGlobal('Hooks', { callAll });
    EventTracker.registerSettings();
    return { settings, callAll };
}

describe('EventTracker settings', () => {
    it('registers the three world settings under the system scope', () => {
        const { settings } = stubWorld();
        expect(settings.store.get(`${SYSTEM_ID}.${EVENT_TRACKER_SETTINGS.resolved}`)).toEqual({});
        expect(settings.store.get(`${SYSTEM_ID}.${EVENT_TRACKER_SETTINGS.campaignDay}`)).toBe(0);
        expect(settings.store.get(`${SYSTEM_ID}.${EVENT_TRACKER_SETTINGS.pcAttitudes}`)).toEqual({});
    });

    it('reads a malformed stored value as empty rather than trusting it', () => {
        const { settings } = stubWorld();
        settings.store.set(`${SYSTEM_ID}.${EVENT_TRACKER_SETTINGS.resolved}`, { A: true });
        settings.store.set(`${SYSTEM_ID}.${EVENT_TRACKER_SETTINGS.campaignDay}`, -3);
        settings.store.set(`${SYSTEM_ID}.${EVENT_TRACKER_SETTINGS.pcAttitudes}`, { Varo: 'warm' });
        expect(EventTracker.getResolved()).toEqual({});
        expect(EventTracker.getCampaignDay()).toBe(0);
        expect(EventTracker.getAllPcAttitudes()).toEqual({});
    });
});

describe('EventTracker.setResolved', () => {
    it('stores, stamps and clears, firing eventResolved once per change', async () => {
        const { callAll } = stubWorld();
        await EventTracker.setResolved('A', true);
        expect(EventTracker.getResolved()).toMatchObject({ A: { origin: 'manual' } });
        expect(Object.values(EventTracker.getResolved()).map((entry) => /^\d{4}-\d{2}-\d{2}T/.test(entry.resolvedAt))).toEqual([true]);
        expect(callAll).toHaveBeenLastCalledWith(EVENT_TRACKER_HOOKS.eventResolved, 'A', true, MANUAL);

        await EventTracker.setResolved('A', true);
        expect(callAll).toHaveBeenCalledTimes(1);

        await EventTracker.setResolved('A', false);
        expect(EventTracker.getResolved()).toEqual({});
        expect(callAll).toHaveBeenLastCalledWith(EVENT_TRACKER_HOOKS.eventResolved, 'A', false, MANUAL);
    });

    it('carries the origin and detail to the hook and the stored entry', async () => {
        const { callAll } = stubWorld();
        await EventTracker.setResolved('A', true, { origin: 'sync' });
        expect(callAll).toHaveBeenCalledWith(EVENT_TRACKER_HOOKS.eventResolved, 'A', true, { origin: 'sync' });
        await EventTracker.setResolved('B', true, { origin: 'auto', detail: 'item acquired: Data-Slate' });
        expect(callAll).toHaveBeenLastCalledWith(EVENT_TRACKER_HOOKS.eventResolved, 'B', true, { origin: 'auto', detail: 'item acquired: Data-Slate' });
        expect(EventTracker.getResolved()).toMatchObject({ B: { origin: 'auto', detail: 'item acquired: Data-Slate' } });
    });

    it('still reads resolved entries stored before origins existed', () => {
        const { settings } = stubWorld();
        settings.store.set(`${SYSTEM_ID}.${EVENT_TRACKER_SETTINGS.resolved}`, { OLD: { resolvedAt: '2025-01-01T00:00:00.000Z' } });
        expect(Object.keys(EventTracker.getResolved())).toEqual(['OLD']);
    });

    it('is GM-only', async () => {
        const { callAll } = stubWorld(false);
        await expect(EventTracker.setResolved('A', true)).rejects.toThrow(/GM-only/);
        expect(EventTracker.getResolved()).toEqual({});
        expect(callAll).not.toHaveBeenCalled();
    });

    it('drives isAvailable through the exported requirement shapes', async () => {
        stubWorld();
        EventTracker._graph = { ROOT: { name: 'Root' }, NEXT: { name: 'Next', requires: 'ROOT' } };
        expect(EventTracker.isAvailable('NEXT')).toBe(false);
        await EventTracker.setResolved('ROOT', true);
        expect(EventTracker.isAvailable('NEXT')).toBe(true);
        EventTracker._graph = null;
        expect(EventTracker.isAvailable('NEXT')).toBe(false);
    });
});

describe('EventTracker.setCampaignDay', () => {
    it('stores the day and fires campaignDayChanged on change only', async () => {
        const { callAll } = stubWorld();
        await EventTracker.setCampaignDay(3);
        expect(EventTracker.getCampaignDay()).toBe(3);
        expect(callAll).toHaveBeenCalledWith(EVENT_TRACKER_HOOKS.campaignDayChanged, 3, { origin: 'manual' });
        await EventTracker.setCampaignDay(3, { origin: 'sync' });
        expect(callAll).toHaveBeenCalledTimes(1);
    });

    it('rejects an invalid day and a non-GM caller', async () => {
        stubWorld();
        await expect(EventTracker.setCampaignDay(-1)).rejects.toThrow(/non-negative integer/);
        await expect(EventTracker.setCampaignDay(1.5)).rejects.toThrow(/non-negative integer/);
        stubWorld(false);
        await expect(EventTracker.setCampaignDay(2)).rejects.toThrow(/GM-only/);
    });
});

describe('EventTracker per-PC attitudes', () => {
    it('stores per NPC per PC, clears on blank, and fires pcAttitudeChanged', async () => {
        const { callAll } = stubWorld();
        await EventTracker.setPcAttitude('Garrick Varo', 'Ibnad', ' trusting ');
        expect(EventTracker.getPcAttitudes('Garrick Varo')).toEqual({ Ibnad: 'trusting' });
        expect(callAll).toHaveBeenLastCalledWith(EVENT_TRACKER_HOOKS.pcAttitudeChanged, 'Garrick Varo', 'Ibnad', 'trusting', { origin: 'manual' });

        await EventTracker.setPcAttitude('Garrick Varo', 'Ibnad', 'trusting');
        expect(callAll).toHaveBeenCalledTimes(1);

        await EventTracker.setPcAttitude('Garrick Varo', 'Ibnad', '', { origin: 'sync' });
        expect(EventTracker.getPcAttitudes('Garrick Varo')).toEqual({});
        expect(EventTracker.getAllPcAttitudes()).toEqual({});
        expect(callAll).toHaveBeenLastCalledWith(EVENT_TRACKER_HOOKS.pcAttitudeChanged, 'Garrick Varo', 'Ibnad', '', { origin: 'sync' });
    });

    it('is GM-only and rejects empty names', async () => {
        stubWorld();
        await expect(EventTracker.setPcAttitude('', 'Ibnad', 'x')).rejects.toThrow(/non-empty/);
        stubWorld(false);
        await expect(EventTracker.setPcAttitude('Varo', 'Ibnad', 'x')).rejects.toThrow(/GM-only/);
    });
});

describe('EventTracker.computeCharacterStates', () => {
    it('is empty with no characters and recomputes from the resolved setting', async () => {
        stubWorld();
        expect(EventTracker.computeCharacterStates()).toEqual({});
        EventTracker._characters = {
            Vael: {
                dispositions: [
                    { target: 'party', attitude: 'neutral', default: true },
                    { target: 'party', attitude: 'hostile', trigger: 'BETRAYAL' },
                ],
            },
        };
        await EventTracker.setResolved('BETRAYAL', true);
        expect(EventTracker.computeCharacterStates()).toMatchObject({ Vael: { dispositions: { party: { attitude: 'hostile' } } } });
    });
});

describe('EventTracker journal links', () => {
    afterEach(() => {
        EventTracker.registerJournalLinkResolver(null);
    });

    it('falls back to an exact-name match over game.journal when no resolver is registered', () => {
        stubWorld(true, [{ name: 'The Sump', uuid: 'JournalEntry.sump', flags: {} }]);
        expect(EventTracker.resolveJournalLink({ kind: 'location', name: 'The Sump' })).toBe('JournalEntry.sump');
        expect(EventTracker.resolveJournalLink({ kind: 'location', name: 'Nowhere' })).toBeNull();
    });

    it('prefers a registered resolver, falling back when it returns null', () => {
        stubWorld(true, [{ name: 'The Sump', uuid: 'JournalEntry.sump', flags: {} }]);
        EventTracker.registerJournalLinkResolver((ref) => (ref.kind === 'character' ? `JournalEntry.${ref.name}` : null));
        expect(EventTracker.resolveJournalLink({ kind: 'character', name: 'Varo' })).toBe('JournalEntry.Varo');
        expect(EventTracker.resolveJournalLink({ kind: 'location', name: 'The Sump' })).toBe('JournalEntry.sump');
        EventTracker.registerJournalLinkResolver(null);
        expect(EventTracker.resolveJournalLink({ kind: 'character', name: 'Varo' })).toBeNull();
    });

    it('matches the vault identity flag before the journal name, preferring the kind-fitting entity type', () => {
        stubWorld(true, [
            { name: 'Garrick Varo', uuid: 'JournalEntry.byName', flags: {} },
            {
                name: 'Varo (notes)',
                uuid: 'JournalEntry.note',
                flags: { [SYSTEM_ID]: { vault: { path: 'Lore/Varo.md', entityType: 'note', name: 'Garrick Varo' } } },
            },
            {
                name: 'Varo (renamed)',
                uuid: 'JournalEntry.character',
                flags: { [SYSTEM_ID]: { vault: { path: 'Characters/Garrick Varo.md', entityType: 'character', name: 'Garrick Varo' } } },
            },
        ]);
        expect(EventTracker.resolveJournalLink({ kind: 'character', name: 'Garrick Varo' })).toBe('JournalEntry.character');
        expect(EventTracker.resolveJournalLink({ kind: 'location', name: 'Garrick Varo' })).toBe('JournalEntry.note');
    });

    it('reads the location vault identity a spawned scene copies from the world journals', () => {
        stubWorld(true, [
            { name: 'The Sump', uuid: 'JournalEntry.plain', flags: {} },
            {
                name: 'Sump (renamed)',
                uuid: 'JournalEntry.sump',
                flags: { [SYSTEM_ID]: { vault: { path: 'Locations/The Sump.md', entityType: 'location', name: 'The Sump' } } },
            },
        ]);
        expect(EventTracker.findLocationVaultIdentity('The Sump')).toEqual({ path: 'Locations/The Sump.md', entityType: 'location', name: 'The Sump' });
        expect(EventTracker.findLocationVaultIdentity('Nowhere')).toBeNull();
    });
});

describe('EventTracker.open', () => {
    it('refuses a player and a world with no graph', () => {
        const warn = vi.fn();
        vi.stubGlobal('ui', { notifications: { warn } });
        stubWorld(false);
        EventTracker.open();
        expect(warn).toHaveBeenLastCalledWith('WH40K.Notify.EventTracker.GmOnly');
        stubWorld(true);
        EventTracker.open();
        expect(warn).toHaveBeenLastCalledWith('WH40K.Notify.EventTracker.GraphNotLoaded');
    });
});
