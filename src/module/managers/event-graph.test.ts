import { describe, expect, it, vi } from 'vitest';
import {
    activeDisposition,
    campaignDayParts,
    compareSources,
    computeCharacterStates,
    type DispositionEntry,
    type EventGraph,
    evaluateRequirement,
    eventLocationName,
    eventSourceName,
    findJournalUuid,
    findJournalUuidByName,
    findJournalUuidByVaultIdentity,
    flattenRequirements,
    isEventAvailable,
    isPartyDisposition,
    isPcAttitudeMap,
    isResolved,
    isResolvedState,
    isValidCampaignDay,
    type JournalRef,
    type NamedJournal,
    nextDispositionShift,
    normaliseRequirements,
    omitKey,
    predicateCriteria,
    type ResolvedState,
    resolveJournalUuid,
    sourceDayLabel,
    sourceDayNumber,
    sourceRefKind,
    sourceSortKey,
    stepCampaignDay,
    stripWikiLink,
    UNDATED_SOURCE_SORT_KEY,
    type VaultEntityType,
    type VaultJournalIdentity,
    withPcAttitude,
} from './event-graph.ts';

const AT = { resolvedAt: '2026-01-01T00:00:00.000Z' };
const resolvedOf = (...ids: string[]): ResolvedState => Object.fromEntries(ids.map((id) => [id, AT]));

describe('isResolved', () => {
    it('tests own keys only, so inherited names never read as resolved', () => {
        expect(isResolved(resolvedOf('A'), 'A')).toBe(true);
        expect(isResolved(resolvedOf('A'), 'B')).toBe(false);
        expect(isResolved({}, 'constructor')).toBe(false);
    });
});

describe('normaliseRequirements', () => {
    it('returns null when nothing is required', () => {
        expect(normaliseRequirements({})).toBeNull();
        expect(normaliseRequirements({ requires: null, requires_any: [] })).toBeNull();
        expect(normaliseRequirements({ requires: [] })).toBeNull();
    });

    it('keeps a single node (the exported shape: a bare string or a tree)', () => {
        expect(normaliseRequirements({ requires: 'A' })).toBe('A');
        expect(normaliseRequirements({ requires: { any: ['A', 'B'] } })).toEqual({ any: ['A', 'B'] });
    });

    it('reads a legacy list as an implicit all', () => {
        expect(normaliseRequirements({ requires: ['A', 'B'] })).toEqual({ all: ['A', 'B'] });
        expect(normaliseRequirements({ requires: ['A'] })).toBe('A');
    });

    it('folds requires_any in alongside requires', () => {
        expect(normaliseRequirements({ requires: 'A', requires_any: ['B', 'C'] })).toEqual({ all: ['A', { any: ['B', 'C'] }] });
        expect(normaliseRequirements({ requires_any: ['B'] })).toEqual({ any: ['B'] });
    });
});

describe('evaluateRequirement', () => {
    const resolved = resolvedOf('A', 'C');
    it('evaluates leaves, all and any', () => {
        expect(evaluateRequirement(null, {})).toBe(true);
        expect(evaluateRequirement('A', resolved)).toBe(true);
        expect(evaluateRequirement('B', resolved)).toBe(false);
        expect(evaluateRequirement({ all: ['A', 'C'] }, resolved)).toBe(true);
        expect(evaluateRequirement({ all: ['A', 'B'] }, resolved)).toBe(false);
        expect(evaluateRequirement({ any: ['B', 'C'] }, resolved)).toBe(true);
        expect(evaluateRequirement({ any: [] }, resolved)).toBe(false);
    });

    it('nests', () => {
        expect(evaluateRequirement({ any: [{ all: ['A', 'B'] }, 'C'] }, resolved)).toBe(true);
        expect(evaluateRequirement({ all: ['A', { any: ['B', 'D'] }] }, resolved)).toBe(false);
    });

    it('never satisfies a character predicate (GM judgement), but an any can route around one', () => {
        expect(evaluateRequirement({ char: { skill: 'scrutiny' } }, resolved)).toBe(false);
        expect(evaluateRequirement({ any: [{ char: { skill: 'scrutiny' } }, 'A'] }, resolved)).toBe(true);
    });
});

describe('isEventAvailable', () => {
    const graph: EventGraph = {
        ROOT: { name: 'Root' },
        NEXT: { name: 'Next', requires: 'ROOT' },
        GATE: { name: 'Gate', requires: ['ROOT'], requires_any: ['SIDE_A', 'SIDE_B'] },
    };
    it('unknown events are never available', () => {
        expect(isEventAvailable(graph, {}, 'MISSING')).toBe(false);
        expect(isEventAvailable(graph, {}, 'constructor')).toBe(false);
    });
    it('follows the requirement tree, including bare-string requires', () => {
        expect(isEventAvailable(graph, {}, 'ROOT')).toBe(true);
        expect(isEventAvailable(graph, {}, 'NEXT')).toBe(false);
        expect(isEventAvailable(graph, resolvedOf('ROOT'), 'NEXT')).toBe(true);
        expect(isEventAvailable(graph, resolvedOf('ROOT'), 'GATE')).toBe(false);
        expect(isEventAvailable(graph, resolvedOf('ROOT', 'SIDE_B'), 'GATE')).toBe(true);
    });
});

describe('flattenRequirements / predicateCriteria', () => {
    it('flattens a tree depth-first with group labels and met flags', () => {
        const rows = flattenRequirements({ all: ['A', { any: ['B', { char: { skill: ['logic', 'scrutiny'], who: 'all' } }] }] }, resolvedOf('A'));
        expect(rows).toEqual([
            { kind: 'all', depth: 0 },
            { kind: 'event', depth: 1, eventId: 'A', met: true },
            { kind: 'any', depth: 1 },
            { kind: 'event', depth: 2, eventId: 'B', met: false },
            { kind: 'predicate', depth: 2, criteria: [{ dimension: 'skill', values: ['logic', 'scrutiny'] }] },
        ]);
        expect(flattenRequirements(null, {})).toEqual([]);
    });

    it('lists predicate dimensions without the who metadata', () => {
        expect(predicateCriteria({ char: { background: 'adeptus-arbites', skill: 'awareness' } })).toEqual([
            { dimension: 'background', values: ['adeptus-arbites'] },
            { dimension: 'skill', values: ['awareness'] },
        ]);
    });
});

describe('source day ordering', () => {
    it('parses plain and M-prefixed day numbers', () => {
        expect(sourceDayNumber('Day 3 — Pressure Surfaces')).toBe(3);
        expect(sourceDayNumber('Day M2 — The Source')).toBe(102);
        expect(sourceDayNumber('The Sick Child')).toBeNull();
        expect(sourceSortKey('Session 12 — No Way but Down')).toBe(UNDATED_SOURCE_SORT_KEY);
    });

    it('orders days, then M-days, then undated by name, then unnamed', () => {
        const sorted = ['The Sick Child', '', 'Day M1 — Transit', 'Day 10 — Late', 'Day 2 — Early', 'Day 0 — Arrival', 'Session 9 — Quiet'].sort(
            compareSources,
        );
        expect(sorted).toEqual(['Day 0 — Arrival', 'Day 2 — Early', 'Day 10 — Late', 'Day M1 — Transit', 'Session 9 — Quiet', 'The Sick Child', '']);
    });

    it('extracts the Day label of a day-plan source only', () => {
        expect(sourceDayLabel('Day 3 — Pressure Surfaces')).toBe('Day 3');
        expect(sourceDayLabel('Day M1 — Transit and Archive')).toBe('Day M1');
        expect(sourceDayLabel('The Sick Child')).toBeNull();
    });
});

describe('event names', () => {
    it('strips wiki links, keeping the target of a piped link', () => {
        expect(stripWikiLink('[[The Errant Vector]]')).toBe('The Errant Vector');
        expect(stripWikiLink('[[Block 9 Unit 14|Block 9, Unit 14]]')).toBe('Block 9 Unit 14');
        expect(stripWikiLink('  Plain  ')).toBe('Plain');
    });

    it('reads source and location, tolerating missing fields', () => {
        expect(eventSourceName({ name: 'x', source_name: 'Day 0', source_file: 'Days/Day 0.md' })).toBe('Day 0');
        expect(eventSourceName({ name: 'x', source_file: 'Days/Day 0.md' })).toBe('Days/Day 0.md');
        expect(eventSourceName({ name: 'x' })).toBe('');
        expect(eventLocationName({ name: 'x', location: '[[The Sump]]' })).toBe('The Sump');
        expect(eventLocationName({ name: 'x', location: null })).toBe('');
    });

    it('classifies a source as a quest or a day plan by its file', () => {
        expect(sourceRefKind({ name: 'x', source_file: 'Quests/The Sick Child.md' })).toBe('quest');
        expect(sourceRefKind({ name: 'x', source_file: 'Days/Day 1.md' })).toBe('event-source');
        expect(sourceRefKind({ name: 'x' })).toBe('event-source');
    });
});

describe('campaign day', () => {
    it('splits M-days out of the offset range', () => {
        expect(campaignDayParts(4)).toEqual({ midnight: false, number: 4 });
        expect(campaignDayParts(101)).toEqual({ midnight: true, number: 1 });
    });
    it('steps without going below zero', () => {
        expect(stepCampaignDay(3, 1)).toBe(4);
        expect(stepCampaignDay(0, -1)).toBe(0);
    });
    it('accepts only non-negative integers', () => {
        expect(isValidCampaignDay(0)).toBe(true);
        expect(isValidCampaignDay(7)).toBe(true);
        expect(isValidCampaignDay(-1)).toBe(false);
        expect(isValidCampaignDay(1.5)).toBe(false);
        expect(isValidCampaignDay(Number.NaN)).toBe(false);
    });
});

describe('dispositions', () => {
    const entries: DispositionEntry[] = [
        { attitude: 'neutral', default: true, note: 'base' },
        { attitude: 'wary', trigger: 'T1' },
        { attitude: 'hostile', trigger: 'T2' },
    ];

    it('identifies party dispositions', () => {
        expect(isPartyDisposition({ attitude: 'x' })).toBe(true);
        expect(isPartyDisposition({ attitude: 'x', target: '' })).toBe(true);
        expect(isPartyDisposition({ attitude: 'x', target: 'party' })).toBe(true);
        expect(isPartyDisposition({ attitude: 'x', target: 'Ibnad' })).toBe(false);
    });

    it('picks the last fired trigger, else the default, else the first entry', () => {
        expect(activeDisposition(entries, {})?.attitude).toBe('neutral');
        expect(activeDisposition(entries, resolvedOf('T1'))?.attitude).toBe('wary');
        expect(activeDisposition(entries, resolvedOf('T1', 'T2'))?.attitude).toBe('hostile');
        expect(activeDisposition([{ attitude: 'first' }, { attitude: 'second' }], {})?.attitude).toBe('first');
        expect(activeDisposition([], {})).toBeUndefined();
    });

    it('finds the next unfired shift after the active entry', () => {
        const [base, wary, hostile] = [
            { attitude: 'neutral', default: true },
            { attitude: 'wary', trigger: 'T1' },
            { attitude: 'hostile', trigger: 'T2' },
        ];
        const authored: DispositionEntry[] = [base, wary, hostile];
        expect(nextDispositionShift(authored, base, {})?.attitude).toBe('wary');
        expect(nextDispositionShift(authored, wary, resolvedOf('T1'))?.attitude).toBe('hostile');
        expect(nextDispositionShift(authored, base, resolvedOf('T1'))?.attitude).toBe('hostile');
        expect(nextDispositionShift(authored, hostile, resolvedOf('T1', 'T2'))).toBeUndefined();
    });
});

describe('computeCharacterStates', () => {
    it('groups dispositions by target and walks relationship influences', () => {
        const states = computeCharacterStates(
            {
                Vael: {
                    dispositions: [
                        { target: 'party', attitude: 'neutral', default: true },
                        { target: 'party', attitude: 'hostile', trigger: 'BETRAYAL' },
                        { target: 'Ibnad', attitude: 'warm', default: true },
                    ],
                    relationships: [
                        {
                            target: 'Holt',
                            type: 'ally',
                            state: 'wary',
                            summary: 's',
                            influences: [
                                { event: 'PACT', to: 'ally' },
                                { event: 'FEUD', to: 'enemy' },
                            ],
                        },
                        { target: 'Varo', type: 'rival', state: 'rival' },
                    ],
                },
            },
            resolvedOf('BETRAYAL', 'PACT'),
        );
        expect(states).toEqual({
            Vael: {
                dispositions: {
                    party: { target: 'party', attitude: 'hostile', trigger: 'BETRAYAL' },
                    Ibnad: { target: 'Ibnad', attitude: 'warm', default: true },
                },
                relationships: [
                    { target: 'Holt', type: 'ally', currentState: 'ally', summary: 's', trigger: 'PACT' },
                    { target: 'Varo', type: 'rival', currentState: 'rival' },
                ],
            },
        });
    });
});

describe('withPcAttitude / omitKey', () => {
    it('sets, trims, clears, and drops emptied NPCs', () => {
        const one = withPcAttitude({}, 'Varo', 'Ibnad', '  trusting ');
        expect(one).toEqual({ Varo: { Ibnad: 'trusting' } });
        const two = withPcAttitude(one, 'Varo', 'Gus', 'wary');
        expect(two).toEqual({ Varo: { Ibnad: 'trusting', Gus: 'wary' } });
        expect(withPcAttitude(two, 'Varo', 'Gus', '   ')).toEqual({ Varo: { Ibnad: 'trusting' } });
        expect(withPcAttitude(one, 'Varo', 'Ibnad', '')).toEqual({});
        expect(one).toEqual({ Varo: { Ibnad: 'trusting' } });
    });
    it('omits a key without mutating', () => {
        const source = { a: 1, b: 2 };
        expect(omitKey(source, 'a')).toEqual({ b: 2 });
        expect(source).toEqual({ a: 1, b: 2 });
    });
});

describe('stored-setting guards', () => {
    it('isResolvedState', () => {
        expect(isResolvedState({})).toBe(true);
        expect(isResolvedState({ A: AT })).toBe(true);
        expect(isResolvedState({ A: { ...AT, origin: 'auto', detail: 'scene entered' } })).toBe(true);
        expect(isResolvedState({ A: { ...AT, origin: 'bogus' } })).toBe(false);
        expect(isResolvedState({ A: { ...AT, detail: 3 } })).toBe(false);
        expect(isResolvedState({ A: true })).toBe(false);
        expect(isResolvedState(null)).toBe(false);
        expect(isResolvedState([])).toBe(false);
    });
    it('isPcAttitudeMap', () => {
        expect(isPcAttitudeMap({ Varo: { Ibnad: 'warm' } })).toBe(true);
        expect(isPcAttitudeMap({ Varo: { Ibnad: 3 } })).toBe(false);
        expect(isPcAttitudeMap({ Varo: 'warm' })).toBe(false);
        expect(isPcAttitudeMap('x')).toBe(false);
    });
});

describe('journal link resolution', () => {
    const journals = [
        { name: 'The Sump', uuid: 'JournalEntry.sump' },
        { name: 'Garrick Varo', uuid: 'JournalEntry.varo' },
        { name: 'The Sump', uuid: 'JournalEntry.duplicate' },
    ];
    const fallback = (ref: JournalRef): string | null => findJournalUuidByName(journals, ref.name);

    it('the built-in lookup matches the exact name, first match wins', () => {
        expect(findJournalUuidByName(journals, 'The Sump')).toBe('JournalEntry.sump');
        expect(findJournalUuidByName(journals, 'the sump')).toBeNull();
        expect(findJournalUuidByName(journals, '')).toBeNull();
    });

    it('prefers the registered resolver when it answers', () => {
        const registered = vi.fn((ref: JournalRef) => (ref.kind === 'location' ? 'JournalEntry.kanka.JournalEntryPage.p1' : null));
        expect(resolveJournalUuid({ kind: 'location', name: 'The Sump' }, registered, fallback)).toBe('JournalEntry.kanka.JournalEntryPage.p1');
        expect(registered).toHaveBeenCalledWith({ kind: 'location', name: 'The Sump' });
    });

    it('falls back when there is no resolver, it returns null or empty, or it throws', () => {
        const ref: JournalRef = { kind: 'character', name: 'Garrick Varo' };
        expect(resolveJournalUuid(ref, null, fallback)).toBe('JournalEntry.varo');
        expect(resolveJournalUuid(ref, () => null, fallback)).toBe('JournalEntry.varo');
        expect(resolveJournalUuid(ref, () => '', fallback)).toBe('JournalEntry.varo');
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        expect(
            resolveJournalUuid(
                ref,
                () => {
                    throw new Error('boom');
                },
                fallback,
            ),
        ).toBe('JournalEntry.varo');
        expect(error).toHaveBeenCalled();
        error.mockRestore();
    });

    it('resolves nothing for an unknown or empty name', () => {
        expect(resolveJournalUuid({ kind: 'item', name: 'Nope' }, null, fallback)).toBeNull();
        expect(resolveJournalUuid({ kind: 'item', name: '' }, () => 'JournalEntry.x', fallback)).toBeNull();
    });
});

describe('vault-identity journal lookup', () => {
    const vault = (entityType: VaultEntityType, name: string): VaultJournalIdentity => ({ path: `${entityType}/${name}.md`, entityType, name });

    it('a vault-flag match wins over an exact journal-name match', () => {
        const journals: NamedJournal[] = [
            { name: 'The Sump', uuid: 'JournalEntry.byName' },
            { name: 'Bar (renamed by the GM)', uuid: 'JournalEntry.byFlag', vault: vault('location', 'The Sump') },
        ];
        expect(findJournalUuid(journals, { kind: 'location', name: 'The Sump' })).toBe('JournalEntry.byFlag');
    });

    it('prefers the entity type that fits the reference kind', () => {
        const journals: NamedJournal[] = [
            { name: 'Varo note', uuid: 'JournalEntry.note', vault: vault('note', 'Garrick Varo') },
            { name: 'Varo', uuid: 'JournalEntry.character', vault: vault('character', 'Garrick Varo') },
        ];
        expect(findJournalUuid(journals, { kind: 'character', name: 'Garrick Varo' })).toBe('JournalEntry.character');
        // No fitting type: the first flag match still beats the name lookup.
        expect(findJournalUuid(journals, { kind: 'location', name: 'Garrick Varo' })).toBe('JournalEntry.note');
    });

    it('an event source prefers a journal, then a quest', () => {
        const journals: NamedJournal[] = [
            { name: 'q', uuid: 'JournalEntry.quest', vault: vault('quest', 'Day 4') },
            { name: 'j', uuid: 'JournalEntry.journal', vault: vault('journal', 'Day 4') },
        ];
        expect(findJournalUuid(journals, { kind: 'event-source', name: 'Day 4' })).toBe('JournalEntry.journal');
        expect(findJournalUuid(journals.slice(0, 1), { kind: 'event-source', name: 'Day 4' })).toBe('JournalEntry.quest');
        expect(findJournalUuid(journals, { kind: 'quest', name: 'Day 4' })).toBe('JournalEntry.quest');
    });

    it('falls back to the exact journal name when no vault flag names the reference', () => {
        const journals: NamedJournal[] = [
            { name: 'The Sump', uuid: 'JournalEntry.sump' },
            { name: 'Other', uuid: 'JournalEntry.other', vault: vault('location', 'Elsewhere') },
        ];
        expect(findJournalUuid(journals, { kind: 'location', name: 'The Sump' })).toBe('JournalEntry.sump');
        expect(findJournalUuidByVaultIdentity(journals, { kind: 'location', name: 'The Sump' })).toBeNull();
        expect(findJournalUuid(journals, { kind: 'location', name: '' })).toBeNull();
        expect(findJournalUuid(journals, { kind: 'location', name: 'Nowhere' })).toBeNull();
    });
});
