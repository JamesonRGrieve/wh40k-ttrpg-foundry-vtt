/**
 * Round trip of the public fixture adventure, The Ashford Mill (#592):
 * compile (the build's Adventure resolver) → import (Foundry's `keepId` create of
 * every embedded document) → the Event Tracker's loader → the completion watcher.
 *
 * Asserts the tracker sees the adventure's events namespaced by its scenario id,
 * with every reference resolved to a document the import created, and that
 * killing the fixture NPC resolves its event.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type PackJson, packRecords } from '../scripts/lib/pack-sublevels.cjs';
import {
    buildUuidIndex,
    type CompiledAdventure,
    type EmbeddedDocument,
    findScenario,
    type PackSourceDocument,
    resolveAdventure,
} from '../scripts/resolve-adventures.cjs';
import {
    type AdventureScenario,
    type DocLookup,
    isAdventureScenario,
    loadAdventureGraph,
    type ResolvedDocRef,
} from '../src/module/managers/adventure-event-graph.ts';
import { identifyActor } from '../src/module/managers/event-completion.ts';
import { autoResolutions, createRefResolver, type EventDef, isEventAvailable } from '../src/module/managers/event-graph.ts';

const PACKS = resolve(__dirname, '../src/packs');
const SOURCE = resolve(PACKS, 'homebrew/hb-dh2-adventures/_source/the-ashford-mill_ashfordMillAdv01.json');
const ACTOR_UUID = 'Compendium.wh40k-rpg.hb-dh2-ashford-actors-npcs.Actor.ashOrrinVael0001';

// eslint-disable-next-line no-restricted-syntax -- boundary: JSON.parse returns unknown; the pack source files are the fixture under test
const readSource = (filePath: string): PackSourceDocument => JSON.parse(readFileSync(filePath, 'utf8')) as PackSourceDocument;

/** A world document an Adventure import created (same id as the embedded copy). */
interface WorldDoc {
    documentName: string;
    doc: EmbeddedDocument;
}

/** A document's `_stats.compendiumSource`, or null. */
function compendiumSource(doc: EmbeddedDocument): string | null {
    const stats: PackJson = doc['_stats'];
    if (stats === null || typeof stats !== 'object' || Array.isArray(stats)) return null;
    const source = stats['compendiumSource'];
    return typeof source === 'string' ? source : null;
}

/** The compiled adventure's scenario flag; fails the test when it is missing or malformed. */
function scenarioOf(adventure: CompiledAdventure): AdventureScenario {
    const scenario = findScenario(adventure.journal);
    if (!isAdventureScenario(scenario)) throw new Error('the fixture adventure carries no scenario event graph');
    return scenario;
}

/** Every world UUID an event's references resolved to. */
function linksOf(event: EventDef): string[] {
    const links = event.links ?? {};
    return [links.source, links.location, links.quest].filter((uuid): uuid is string => uuid !== undefined);
}

/** Foundry's Adventure import: every embedded document becomes a world document with the same id. */
function importAdventure(adventure: CompiledAdventure): WorldDoc[] {
    return [
        ...adventure.journal.map((doc) => ({ documentName: 'JournalEntry', doc })),
        ...adventure.actors.map((doc) => ({ documentName: 'Actor', doc })),
        ...adventure.scenes.map((doc) => ({ documentName: 'Scene', doc })),
        ...adventure.items.map((doc) => ({ documentName: 'Item', doc })),
    ];
}

const worldUuid = ({ documentName, doc }: WorldDoc): string => `${documentName}.${doc._id}`;

/** The tracker's lookups over the imported world (the live ones read `game.*` and `fromUuidSync`). */
function worldLookup(world: readonly WorldDoc[]): DocLookup {
    const ref = (entry: WorldDoc): ResolvedDocRef => ({ name: entry.doc.name, uuid: worldUuid(entry) });
    return {
        imported: (documentName, id, uuid) => {
            const docs = world.filter((entry) => entry.documentName === documentName);
            const match = docs.find((entry) => compendiumSource(entry.doc) === uuid) ?? docs.find((entry) => entry.doc._id === id);
            return match === undefined ? null : ref(match);
        },
        byUuid: (uuid) => {
            const match = world.find((entry) => worldUuid(entry) === uuid);
            return match === undefined ? null : ref(match);
        },
    };
}

describe('The Ashford Mill — compile → import → Event Tracker (#592)', () => {
    const compiled = resolveAdventure(readSource(SOURCE), buildUuidIndex(PACKS, readSource), 'fixture');
    const world = importAdventure(compiled);

    it('compiles to an Adventure embedding its journals and a copy of its NPC stamped with its compendium source', () => {
        expect(compiled.journal.map((entry) => entry._id)).toEqual(['ashGmGuide000001', 'ashChapter000001', 'ashChapter000002', 'ashMillPlace0001']);
        expect(compiled.actors.map((actor) => [actor._id, actor.name, compendiumSource(actor)])).toEqual([['ashOrrinVael0001', 'Orrin Vael', ACTOR_UUID]]);
        // The compiled document is one Adventure record (Adventure has no embedded sublevels).
        expect(packRecords('adventures', compiled).records.map((record) => record.key)).toEqual(['!adventures!ashfordMillAdv01']);
    });

    it('loads into the tracker namespaced by its scenario id, with every reference resolved to an imported document', () => {
        const gmGuide = world.find((entry) => entry.doc._id === 'ashGmGuide000001');
        expect(gmGuide?.doc.name).toBe('The Ashford Mill — GM Guide');
        const { events, characters } = loadAdventureGraph(scenarioOf(compiled), gmGuide?.doc.name ?? '', worldLookup(world));

        expect(Object.keys(events)).toEqual([
            'ashford-mill:ARRIVE',
            'ashford-mill:QUESTION_WORKERS',
            'ashford-mill:FOREMAN_FALLS',
            'ashford-mill:LEAVE_ASHFORD',
        ]);
        expect(events['ashford-mill:QUESTION_WORKERS']).toMatchObject({
            source_name: 'Chapter 1 — Arrival',
            location: 'Ashford Mill',
            requires: 'ashford-mill:ARRIVE',
            day: 1,
            links: { source: 'JournalEntry.ashChapter000001', location: 'JournalEntry.ashMillPlace0001' },
        });
        // Every link names a document the import created.
        const worldUuids = new Set(world.map(worldUuid));
        const links = Object.values(events).flatMap(linksOf);
        expect(links).toHaveLength(6);
        expect(links.filter((uuid) => !worldUuids.has(uuid))).toEqual([]);
        expect(characters['ashford-mill:foreman']).toMatchObject({ label: 'Orrin Vael', link: 'Actor.ashOrrinVael0001' });
    });

    it('resolves "The Foreman Falls" when the imported foreman, or a token placed from him, dies', () => {
        const { events } = loadAdventureGraph(scenarioOf(compiled), 'The Ashford Mill', worldLookup(world));
        const resolved = { 'ashford-mill:ARRIVE': { resolvedAt: 'x' }, 'ashford-mill:QUESTION_WORKERS': { resolvedAt: 'x' } };
        expect(isEventAvailable(events, resolved, 'ashford-mill:FOREMAN_FALLS')).toBe(true);

        const orrin = world.find((entry) => entry.documentName === 'Actor');
        const base = {
            name: 'Orrin Vael',
            flags: {},
            _stats: { compendiumSource: orrin === undefined ? null : compendiumSource(orrin.doc) },
            hasPlayerOwner: false,
        };
        const linked = identifyActor({ ...base, uuid: 'Actor.ashOrrinVael0001' });
        // An unlinked token's synthetic actor: its own UUID is the token's, its source data the base actor's.
        const token = identifyActor({ ...base, uuid: 'Scene.s.Token.t.Actor.ashOrrinVael0001', id: 'ashOrrinVael0001', isToken: true });
        const resolver = createRefResolver(() => []);
        for (const actor of [linked, token]) {
            const hits = autoResolutions(events, resolved, { kind: 'actor-status', actor, status: 'dead', change: 'gained' }, resolver);
            expect(hits.map((hit) => hit.eventId)).toEqual(['ashford-mill:FOREMAN_FALLS']);
        }
    });
});
