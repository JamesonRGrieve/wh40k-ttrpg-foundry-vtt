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
import { EVENT_GRAPH_FLAG, EventTracker } from './event-tracker.ts';

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

/** A journal collection carrying the given entries, shaped like Foundry's. */
function stubJournal(entries: JournalStub[]): void {
    vi.stubGlobal('game', { journal: entries });
}

function resetTracker(): void {
    EventTracker._graph = null;
    EventTracker._characters = null;
    EventTracker._dataVersion = 1;
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
