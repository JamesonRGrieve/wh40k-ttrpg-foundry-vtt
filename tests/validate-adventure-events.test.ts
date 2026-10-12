/**
 * The adventure event-graph validator (#592) that fails `gulp packs` on a
 * malformed graph: dangling event ids, unknown trigger kinds / fields, unknown
 * status ids, and references that are bare names or do not resolve.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildUuidIndex, type PackSourceDocument, type UuidIndex, type UuidIndexEntry } from '../scripts/resolve-adventures.cjs';
import {
    COMPLETION_TRIGGER_FIELDS,
    conditionStatusIds,
    TRIGGER_OPTION_FIELDS,
    validateAdventurePacks,
    validateEventGraph,
} from '../scripts/validate-adventure-events.cjs';
import { COMPLETION_TRIGGER_FIELDS as TS_TRIGGER_FIELDS, TRIGGER_OPTION_FIELDS as TS_OPTION_FIELDS } from '../src/module/managers/event-graph.ts';

const PUBLIC_PACKS = resolve(__dirname, '../src/packs');
// eslint-disable-next-line no-restricted-syntax -- boundary: JSON.parse returns unknown; these are pack source files
const readSource = (filePath: string): PackSourceDocument => JSON.parse(readFileSync(filePath, 'utf8')) as PackSourceDocument;

const ACTOR = 'Compendium.wh40k-rpg.test-actors-npcs.Actor.testActor0000001';
const ITEM = 'Compendium.wh40k-rpg.test-items-gear.Item.testItem00000001';
const CONDITION = 'Compendium.wh40k-rpg.test-items-conditions.Item.testCondition001';

/** A compiled-pack index holding one actor, one item and one condition (`stunned`). */
const INDEX: UuidIndex = new Map<string, UuidIndexEntry>([
    [ACTOR, { doc: { _id: 'testActor0000001', type: 'dh2-npc' }, packName: 'test-actors-npcs', collection: 'actors' }],
    [ITEM, { doc: { _id: 'testItem00000001', type: 'gear' }, packName: 'test-items-gear', collection: 'items' }],
    [
        CONDITION,
        { doc: { _id: 'testCondition001', type: 'condition', system: { identifier: 'stunned' } }, packName: 'test-items-conditions', collection: 'items' },
    ],
]);

const OWN = new Set(['JournalEntry.chapterOne000001', 'JournalEntry.chapterOne000001.JournalEntryPage.pageOne000000001', 'Actor.testActor0000001']);

type Json = PackSourceDocument[string];

/** A valid scenario; each case below breaks one thing. */
function scenario(events: Record<string, Json> = {}, characters?: Json): PackSourceDocument {
    return {
        id: 'test-adventure',
        eventGraph: {
            events: {
                START: { name: 'Start', source: { uuid: 'JournalEntry.chapterOne000001' }, day: 1, act: 1, requires: null },
                FIGHT: {
                    name: 'Fight',
                    location: { uuid: 'JournalEntry.chapterOne000001.JournalEntryPage.pageOne000000001' },
                    requires: ['START'],
                    requires_any: ['START', { char: { skill: 'awareness' } }],
                    excuse: { START: 'Not started.' },
                    completion: [
                        { kind: 'actor-died', actor: { uuid: ACTOR } },
                        { kind: 'actor-status', actor: { uuid: 'Actor.testActor0000001' }, status: 'stunned', change: 'gained' },
                        { kind: 'item-acquired', item: { uuid: ITEM }, holder: 'party' },
                        { kind: 'event-resolved', event: 'START', ignoreRequirements: true },
                    ],
                },
                ...events,
            },
            characters: characters ?? {
                boss: {
                    actor: { uuid: ACTOR },
                    dispositions: [{ target: 'party', attitude: 'hostile', default: true, trigger: 'START' }],
                    relationships: [{ target: { uuid: ACTOR }, type: 'rival', state: 'wary', influences: [{ event: 'FIGHT', to: 'enemy' }] }],
                },
            },
        },
    };
}

/** A one-event addition whose only field under test is `completion`. */
const withTrigger = (trigger: Json): PackSourceDocument => scenario({ X: { name: 'X', completion: [trigger] } });

const statuses = conditionStatusIds(INDEX);
const validate = (s: PackSourceDocument): string[] => validateEventGraph(s, { own: OWN, uuidIndex: INDEX, statuses });

/** One malformed scenario per row, with the single error it must report. */
const BROKEN: Array<[string, PackSourceDocument, RegExp]> = [
    // Dangling event ids, wherever an event is named.
    ['a dangling requires id', scenario({ X: { name: 'X', requires: 'NOPE' } }), /events\.X\.requires: dangling event id "NOPE"/],
    [
        'a dangling id deep in a requirement tree',
        scenario({ X: { name: 'X', requires: { all: ['START', { any: ['NOPE'] }] } } }),
        /requires\.all\[1\]\.any\[0\]: dangling/,
    ],
    ['a dangling requires_any id', scenario({ X: { name: 'X', requires_any: ['NOPE'] } }), /requires_any\[0\]: dangling/],
    ['an excuse for an unknown event', scenario({ X: { name: 'X', excuse: { NOPE: 'no' } } }), /excuse: dangling/],
    ['a dangling event-resolved trigger', withTrigger({ kind: 'event-resolved', event: 'NOPE' }), /completion\[0\]\.event: dangling/],
    [
        'a dangling disposition trigger',
        scenario({}, { boss: { actor: { uuid: ACTOR }, dispositions: [{ target: 'party', attitude: 'wary', trigger: 'NOPE' }] } }),
        /dispositions\[0\]\.trigger: dangling/,
    ],
    [
        'a dangling relationship influence',
        scenario(
            {},
            {
                boss: {
                    actor: { uuid: ACTOR },
                    relationships: [{ target: { uuid: ACTOR }, type: 'ally', state: 'ally', influences: [{ event: 'NOPE', to: 'enemy' }] }],
                },
            },
        ),
        /influences\[0\]\.event: dangling/,
    ],
    // Trigger kinds and fields.
    ['an unknown trigger kind', withTrigger({ kind: 'actor-sneezed', actor: { uuid: ACTOR } }), /unknown trigger kind "actor-sneezed"/],
    ['an unknown trigger field', withTrigger({ kind: 'actor-died', actor: { uuid: ACTOR }, when: 'now' }), /unknown field "when"/],
    ['a missing required trigger field', withTrigger({ kind: 'actor-status', actor: { uuid: ACTOR }, status: 'stunned' }), /missing "change"/],
    [
        'an unknown status change',
        withTrigger({ kind: 'actor-status', actor: { uuid: ACTOR }, status: 'stunned', change: 'sideways' }),
        /change: must be one of gained, lost/,
    ],
    ['a non-boolean ignoreRequirements', withTrigger({ kind: 'actor-died', actor: { uuid: ACTOR }, ignoreRequirements: 'yes' }), /ignoreRequirements/],
    // Status ids.
    [
        'a status no compiled condition declares',
        withTrigger({ kind: 'actor-status', actor: { uuid: ACTOR }, status: 'befuddled', change: 'gained' }),
        /unknown status id "befuddled"/,
    ],
    // References.
    ['a bare name', scenario({ X: { name: 'X', location: 'The Mill' } }), /location: must be a \{uuid\} reference/],
    ['a vault identity', withTrigger({ kind: 'actor-died', actor: { name: 'Orrin', path: 'Characters/Orrin.md' } }), /must be a \{uuid\} reference/],
    ['a UUID-shaped name', scenario({ X: { name: 'X', source: { uuid: 'Orrin Vael' } } }), /neither a wh40k-rpg Compendium UUID nor an adventure-internal/],
    [
        'a Compendium UUID missing from the compiled packs',
        withTrigger({ kind: 'actor-died', actor: { uuid: 'Compendium.wh40k-rpg.test-actors-npcs.Actor.missingActor0001' } }),
        /does not resolve in the compiled packs/,
    ],
    [
        'an internal UUID that is not the adventure’s',
        scenario({ X: { name: 'X', source: { uuid: 'JournalEntry.notInAdventure01' } } }),
        /is not one of the Adventure's own documents/,
    ],
    [
        'a page the adventure’s journal does not have',
        scenario({ X: { name: 'X', location: { uuid: 'JournalEntry.chapterOne000001.JournalEntryPage.missingPage00001' } } }),
        /is not one of the Adventure's own documents/,
    ],
    ['the wrong kind of document', scenario({ X: { name: 'X', location: { uuid: ITEM } } }), /is a Item; expected Scene or JournalEntry or JournalEntryPage/],
    ['a journal where a scene is needed', withTrigger({ kind: 'scene-entered', location: { uuid: 'JournalEntry.chapterOne000001' } }), /expected Scene/],
    ['an adventure-internal Item', withTrigger({ kind: 'item-acquired', item: { uuid: 'Item.testItem00000001' } }), /neither/],
    // Ids and event fields.
    ['a scenario id that cannot namespace', { ...scenario(), id: 'Test:Adventure' }, /scenario\.id: must be a lowercase slug/],
    ['an event id that cannot namespace', scenario({ 'A:B': { name: 'X' } }), /event ids are letters, digits/],
    ['an unknown event field', scenario({ X: { name: 'X', when: 'dusk' } }), /events\.X: unknown field "when"/],
    ['a missing event name', scenario({ X: { name: '' } }), /events\.X\.name: is required/],
    ['a negative day', scenario({ X: { name: 'X', day: -1 } }), /day: must be a non-negative integer/],
    ['an id that differs from its key', scenario({ X: { name: 'X', id: 'Y' } }), /id: must equal its key "X"/],
    ['a character with no actor', scenario({}, { boss: { dispositions: [] } }), /characters\.boss\.actor: is required/],
];

describe('validate-adventure-events — the vocabulary', () => {
    it('carries the same trigger kinds and fields as the TypeScript union', () => {
        expect(COMPLETION_TRIGGER_FIELDS).toEqual(TS_TRIGGER_FIELDS);
        expect(TRIGGER_OPTION_FIELDS).toEqual(TS_OPTION_FIELDS);
    });

    it('knows the condition status ids the compiled packs declare, plus dead', () => {
        expect([...statuses].sort()).toEqual(['dead', 'stunned']);
    });
});

describe('validateEventGraph', () => {
    it('passes a well-formed graph, and a scenario with no event graph at all', () => {
        expect(validate(scenario())).toEqual([]);
        expect(validate({ id: 'test-adventure', scenes: [] })).toEqual([]);
    });

    it.each(BROKEN)('rejects %s', (_label, broken, pattern) => {
        const errors = validate(broken);
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatch(pattern);
    });
});

describe('validateAdventurePacks', () => {
    let root: string | null = null;
    afterEach(() => {
        if (root !== null) rmSync(root, { recursive: true, force: true });
        root = null;
    });

    it('passes the public fixture adventure against the public packs', () => {
        const index = buildUuidIndex(PUBLIC_PACKS, readSource);
        expect(validateAdventurePacks(PUBLIC_PACKS, index, readSource)).toEqual([]);
    });

    it('reports each error with its source path, ignoring non-adventure packs', () => {
        root = mkdtempSync(join(tmpdir(), 'wh40k-adventure-events-'));
        const adventures = join(root, 'group', 'test-adventures', '_source');
        const gear = join(root, 'group', 'test-items-gear', '_source');
        mkdirSync(adventures, { recursive: true });
        mkdirSync(gear, { recursive: true });
        const broken = scenario({ X: { name: 'X', requires: 'NOPE' } });
        // A scenario flag on a non-adventure document is not an adventure, so it is never validated.
        writeFileSync(
            join(gear, 'gear.json'),
            JSON.stringify({ _id: 'testItem00000001', name: 'Gear', type: 'gear', flags: { 'wh40k-rpg': { scenario: broken } } }),
        );
        const adventure = {
            _id: 'testAdventure001',
            name: 'Test',
            journal: [{ _id: 'chapterOne000001', name: 'GM', pages: [{ _id: 'pageOne000000001', name: 'S', flags: { 'wh40k-rpg': { scenario: broken } } }] }],
        };
        writeFileSync(join(adventures, 'test.json'), JSON.stringify(adventure));
        const errors = validateAdventurePacks(root, buildUuidIndex(root, readSource), readSource);
        expect(
            errors.some((error) => error.startsWith(join('group', 'test-adventures', '_source', 'test.json')) && error.includes('dangling event id "NOPE"')),
        ).toBe(true);
        expect(errors.every((error) => error.includes('test-adventures'))).toBe(true);
    });
});
