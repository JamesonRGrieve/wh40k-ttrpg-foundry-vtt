import { describe, expect, it } from 'vitest';
import type { CharacterState, EventGraph, JournalRef } from '../../managers/event-graph.ts';
import {
    ALL_GRAPHS,
    asEventTrackerTab,
    asGraphFilter,
    buildEventTrackerView,
    type EventGroupView,
    eventTrackerTitleName,
    type EventTrackerViewInput,
    requirementIndentClass,
    stateToneClass,
} from './event-tracker-view.ts';

const AT = { resolvedAt: '2026-01-01T00:00:00.000Z' };

const GRAPH: EventGraph = {
    BRIEFING: { name: 'Briefing', location: '[[The Errant Vector]]', source_name: 'Day 0 — Transit', source_file: 'Days/Day 0.md', requires: null },
    MEAL: { name: 'Crew Meal', location: '[[The Errant Vector]]', source_name: 'Day 0 — Transit', source_file: 'Days/Day 0.md', requires: 'BRIEFING' },
    SUMP: {
        name: 'Visit the Sump',
        location: '[[The Sump]]',
        source_name: 'Day 1 — First Day',
        source_file: 'Days/Day 1.md',
        requires: { all: ['MEAL', { any: ['BRIEFING', { char: { skill: 'scrutiny' } }] }] },
        excuse: { MEAL: 'Still eating.' },
        is_day_end: true,
    },
    CHILD: {
        name: 'The Sick Child',
        source_name: 'The Sick Child',
        source_file: 'Quests/The Sick Child.md',
        requires: 'SUMP',
        excuse: 'Not yet.',
        initiates_quest: '[[The Sick Child]]',
    },
};

const CHARACTERS: Record<string, CharacterState> = {
    'Garrick Varo': {
        dispositions: [
            { target: 'party', attitude: 'neutral', default: true, note: 'Not met.' },
            { target: 'party', attitude: 'helpful', trigger: 'BRIEFING', note: 'Warmed up.' },
            { target: 'party', attitude: 'hostile', trigger: 'SUMP' },
        ],
        relationships: [{ target: 'Harsk', type: 'rival', state: 'wary', influences: [{ event: 'BRIEFING', to: 'enemy' }] }],
    },
    'Abel Harsk': { relationships: [{ target: 'Garrick Varo', type: 'ally', state: 'friendly' }] },
};

function input(overrides: Partial<EventTrackerViewInput> = {}): EventTrackerViewInput {
    return {
        graph: GRAPH,
        characters: CHARACTERS,
        resolved: { BRIEFING: AT },
        campaignDay: 0,
        pcAttitudes: { 'Garrick Varo': { Ibnad: 'trusting' } },
        pcNames: ['Gus', 'Ibnad'],
        activeTab: 'timeline',
        sources: [],
        activeGraph: ALL_GRAPHS,
        activeSceneName: '',
        sceneNames: new Set<string>(),
        journalLink: (ref: JournalRef) => (ref.name === 'The Sump' || ref.name === 'Garrick Varo' ? `JournalEntry.${ref.kind}` : null),
        ...overrides,
    };
}

/** The rows of the group at `index`, or [] when absent. */
function rowsOf(groups: readonly EventGroupView[], index: number): EventGroupView['rows'] {
    return groups.at(index)?.rows ?? [];
}

describe('asEventTrackerTab', () => {
    it('narrows known tabs and falls back to timeline', () => {
        expect(asEventTrackerTab('relations')).toBe('relations');
        expect(asEventTrackerTab('bogus')).toBe('timeline');
        expect(asEventTrackerTab(undefined)).toBe('timeline');
    });
});

describe('class helpers', () => {
    it('maps states to tones with a neutral default', () => {
        expect(stateToneClass('hostile')).toBe('tw-text-[#c66]');
        expect(stateToneClass('who-knows')).toBe('tw-text-[#aaa]');
    });
    it('clamps deep requirement indents', () => {
        expect(requirementIndentClass(0)).toBe('tw-pl-6');
        expect(requirementIndentClass(99)).toBe('tw-pl-24');
    });
});

describe('buildEventTrackerView — header', () => {
    it('reports stats, the day label parts, and the active tab', () => {
        const view = buildEventTrackerView(input({ campaignDay: 102 }));
        expect(view.stats).toEqual({ resolved: 1, total: 4, available: 1 });
        expect(view.day).toEqual({ value: 102, midnight: true, number: 2, canStepBack: true });
        expect(view.tabs.map((tab) => [tab.id, tab.active])).toEqual([
            ['timeline', true],
            ['location', false],
            ['relations', false],
        ]);
        expect(buildEventTrackerView(input()).day.canStepBack).toBe(false);
    });
});

describe('buildEventTrackerView — timeline', () => {
    it('groups by source in chronological order with today / future flags', () => {
        const view = buildEventTrackerView(input({ campaignDay: 0 }));
        expect(view.groups.map((g) => [g.key, g.isCurrent, g.isFuture, g.resolvedCount, g.total])).toEqual([
            ['Day 0 — Transit', true, false, 1, 2],
            ['Day 1 — First Day', false, true, 0, 1],
            ['The Sick Child', false, false, 0, 1],
        ]);
        expect(view.groups.at(2)?.title).toEqual({ label: 'The Sick Child', uuid: null });
    });

    it('marks row status and shows the linked location column', () => {
        const { groups } = buildEventTrackerView(input());
        expect(rowsOf(groups, 0)).toMatchObject([
            { id: 'BRIEFING', resolved: true, available: false, locked: false, requirements: [] },
            { id: 'MEAL', resolved: false, available: true, locked: false, detail: { label: 'The Errant Vector', uuid: null } },
        ]);
        expect(rowsOf(groups, 1)).toMatchObject([{ id: 'SUMP', locked: true, isDayEnd: true, detail: { label: 'The Sump', uuid: 'JournalEntry.location' } }]);
    });

    it('flags events resolved by an automatic trigger with their detail', () => {
        const { groups } = buildEventTrackerView(
            input({ resolved: { BRIEFING: { ...AT, origin: 'auto', detail: 'scene entered' }, MEAL: { ...AT, origin: 'sync' } } }),
        );
        expect(rowsOf(groups, 0).map((row) => row.autoResolvedDetail)).toEqual(['scene entered', null]);
    });

    it('renders the requirement tree of a locked event with per-leaf excuses and predicates', () => {
        const sump = rowsOf(buildEventTrackerView(input()).groups, 1).at(0);
        const rows = sump?.requirements ?? [];
        expect(rows.map((r) => [r.isAll, r.isAny, r.isEvent, r.isPredicate, r.met])).toEqual([
            [true, false, false, false, false],
            [false, false, true, false, false],
            [false, true, false, false, false],
            [false, false, true, false, true],
            [false, false, false, true, false],
        ]);
        expect(rows.at(1)).toMatchObject({
            name: 'Crew Meal',
            location: 'The Errant Vector',
            source: 'Day 0 — Transit',
            sourceDay: 'Day 0',
            excuse: 'Still eating.',
            indentClass: 'tw-pl-9',
        });
        expect(rows.at(4)?.criteria).toBe('skill: scrutiny');
        expect(sump?.excuse).toBeNull();
    });

    it('shows a whole-event excuse and the opened quest', () => {
        const child = rowsOf(buildEventTrackerView(input()).groups, 2).at(0);
        expect(child).toMatchObject({ excuse: 'Not yet.', quest: { label: 'The Sick Child', uuid: null } });
        expect(child?.requirements.at(0)).toMatchObject({ name: 'Visit the Sump', sourceDay: 'Day 1' });
    });
});

describe('buildEventTrackerView — location', () => {
    it('puts the active scene first, then locations with available events, and offers go / spawn', () => {
        const { groups } = buildEventTrackerView(input({ activeTab: 'location', activeSceneName: 'The Sump', sceneNames: new Set(['The Sump']) }));
        expect(groups).toMatchObject([
            { key: 'The Sump', isActiveScene: true, sceneAction: 'go' },
            { key: 'The Errant Vector', isActiveScene: false, sceneAction: 'spawn' },
            { key: '', title: null, sceneAction: null, untitledKey: 'WH40K.EventTracker.NoLocation' },
        ]);
        expect(rowsOf(groups, 1).at(1)?.detail).toEqual({ label: 'Day 0 — Transit', uuid: null });
    });

    it('builds no NPC cards off the relations tab', () => {
        expect(buildEventTrackerView(input({ activeTab: 'location' })).npcs).toEqual([]);
    });
});

describe('buildEventTrackerView — relations', () => {
    it('builds a sorted card per NPC with the active disposition, trigger and next shift', () => {
        const view = buildEventTrackerView(input({ activeTab: 'relations' }));
        expect(view.groups).toEqual([]);
        expect(view.npcs).toMatchObject([
            { npcName: 'Abel Harsk', attitude: null },
            {
                npcName: 'Garrick Varo',
                name: { label: 'Garrick Varo', uuid: 'JournalEntry.character' },
                attitude: 'helpful',
                toneClass: 'tw-text-[#2d6]',
                note: 'Warmed up.',
                triggerName: 'Briefing',
                next: { attitude: 'hostile', triggerName: 'Visit the Sump' },
                relationships: [{ type: 'rival', state: 'enemy', triggerName: 'Briefing' }],
            },
        ]);
    });

    it('lists every PC with the stored attitude, blank meaning not met', () => {
        const view = buildEventTrackerView(input({ activeTab: 'relations' }));
        expect(view.hasPcs).toBe(true);
        expect(view.npcs.at(1)?.pcs.map((pc) => [pc.pcName, pc.value])).toEqual([
            ['Gus', ''],
            ['Ibnad', 'trusting'],
        ]);
        expect(new Set(view.npcs.flatMap((n) => n.pcs.map((pc) => pc.inputId))).size).toBe(4);
    });

    it('is empty without character data', () => {
        expect(buildEventTrackerView(input({ activeTab: 'relations', characters: null })).npcs).toEqual([]);
    });
});

describe('buildEventTrackerView — adventure graphs (#592)', () => {
    const SOURCES = [
        { id: '', label: '' },
        { id: 'mill', label: 'The Mill' },
        { id: 'tower', label: 'The Tower' },
    ];
    // Two adventures that both have a "Chapter 1" and an "Old Mill" location, as the loader leaves them.
    const ADVENTURE_GRAPH: EventGraph = {
        ...GRAPH,
        'mill:A': {
            name: 'Mill A',
            graph: 'mill',
            source_name: 'Chapter 1',
            location: 'Old Mill',
            day: 1,
            links: { source: 'JournalEntry.millCh1', location: 'JournalEntry.millPlace' },
        },
        'mill:B': { name: 'Mill B', graph: 'mill', source_name: 'Chapter 1', location: 'Old Mill', requires: 'mill:A', day: 1 },
        'tower:A': { name: 'Tower A', graph: 'tower', source_name: 'Chapter 1', location: 'Old Mill', day: 3 },
    };
    const ADVENTURE_CHARACTERS: Record<string, CharacterState> = {
        ...CHARACTERS,
        'mill:foreman': {
            graph: 'mill',
            label: 'Orrin Vael',
            link: 'Actor.orrin',
            dispositions: [{ target: 'party', attitude: 'guarded', default: true }],
            relationships: [{ target: 'Ada Vael', type: 'family', state: 'friendly', targetLink: 'Actor.ada' }],
        },
    };
    const adventures = (overrides: Partial<EventTrackerViewInput> = {}): EventTrackerViewInput =>
        input({ graph: ADVENTURE_GRAPH, characters: ADVENTURE_CHARACTERS, sources: SOURCES, ...overrides });

    it('keeps two adventures’ same-named chapters in separate groups, ordered by day, labelled by adventure', () => {
        const { groups } = buildEventTrackerView(adventures({ campaignDay: 1 }));
        expect(groups.map((g) => [g.key, g.name, g.graphLabel, g.isCurrent])).toEqual([
            ['Day 0 — Transit', 'Day 0 — Transit', null, false],
            ['Day 1 — First Day', 'Day 1 — First Day', null, true],
            ['mill:Chapter 1', 'Chapter 1', 'The Mill', true],
            ['tower:Chapter 1', 'Chapter 1', 'The Tower', false],
            ['The Sick Child', 'The Sick Child', null, false],
        ]);
    });

    it('links adventure references to the UUIDs the loader resolved, not a name lookup', () => {
        const { groups } = buildEventTrackerView(adventures({ activeGraph: 'mill' }));
        expect(groups.at(0)?.title).toEqual({ label: 'Chapter 1', uuid: 'JournalEntry.millCh1' });
        expect(rowsOf(groups, 0).at(0)?.detail).toEqual({ label: 'Old Mill', uuid: 'JournalEntry.millPlace' });
        // A row without its own link falls back to the name lookup (which knows nothing of it here).
        expect(rowsOf(groups, 0).at(1)?.detail).toEqual({ label: 'Old Mill', uuid: null });
    });

    it('jumps a requirement to its own adventure’s groups', () => {
        const locked = rowsOf(buildEventTrackerView(adventures({ activeGraph: 'mill' })).groups, 0).at(1);
        expect(locked?.requirements.at(0)).toMatchObject({ name: 'Mill A', sourceKey: 'mill:Chapter 1', locationKey: 'mill:Old Mill' });
    });

    it('filters groups, stats and NPC cards to one graph, with go / spawn reading the plain location name', () => {
        const view = buildEventTrackerView(adventures({ activeTab: 'location', activeGraph: 'mill', sceneNames: new Set(['Old Mill']) }));
        expect(view.groups.map((g) => [g.key, g.name, g.sceneAction, g.graphLabel])).toEqual([['mill:Old Mill', 'Old Mill', 'go', null]]);
        expect(view.stats).toEqual({ resolved: 0, total: 2, available: 1 });
        const relations = buildEventTrackerView(adventures({ activeTab: 'relations', activeGraph: 'mill' }));
        expect(relations.npcs).toMatchObject([
            {
                npcName: 'mill:foreman',
                name: { label: 'Orrin Vael', uuid: 'Actor.orrin' },
                attitude: 'guarded',
                relationships: [{ target: { label: 'Ada Vael', uuid: 'Actor.ada' } }],
            },
        ]);
        const campaign = buildEventTrackerView(adventures({ activeTab: 'relations', activeGraph: '' }));
        expect(campaign.npcs.map((npc) => npc.npcName)).toEqual(['Abel Harsk', 'Garrick Varo']);
    });

    it('offers a filter chip per graph plus "all", only when more than one graph is loaded', () => {
        expect(buildEventTrackerView(adventures({ activeGraph: 'tower' })).graphs).toEqual([
            { id: ALL_GRAPHS, label: '', labelKey: 'WH40K.EventTracker.Graph.All', active: false },
            { id: '', label: '', labelKey: 'WH40K.EventTracker.Graph.Campaign', active: false },
            { id: 'mill', label: 'The Mill', labelKey: null, active: false },
            { id: 'tower', label: 'The Tower', labelKey: null, active: true },
        ]);
        expect(buildEventTrackerView(input()).graphs).toEqual([]);
    });

    it('narrows a data-graph attribute to a loaded graph, else all', () => {
        expect(asGraphFilter('mill', SOURCES)).toBe('mill');
        expect(asGraphFilter('', SOURCES)).toBe('');
        expect(asGraphFilter('gone', SOURCES)).toBe(ALL_GRAPHS);
        expect(asGraphFilter(undefined, SOURCES)).toBe(ALL_GRAPHS);
    });
});

describe('eventTrackerTitleName (#618)', () => {
    const CAMPAIGN = { id: '', label: '' };
    const VOIDSHIP = { id: 'voidship-escapade', label: 'Voidship Escapade' };
    const ASHFORD = { id: 'ashford-mill', label: 'The Ashford Mill' };

    it("names a world that holds only one adventure after that adventure, never the world's title", () => {
        expect(eventTrackerTitleName([VOIDSHIP], 'Tier B Test World')).toBe('Voidship Escapade');
    });

    it("names a campaign world, or one with several adventures, after the world's title", () => {
        expect(eventTrackerTitleName([CAMPAIGN], 'The Long Watch')).toBe('The Long Watch');
        expect(eventTrackerTitleName([CAMPAIGN, ASHFORD], 'The Long Watch')).toBe('The Long Watch');
        expect(eventTrackerTitleName([VOIDSHIP, ASHFORD], 'The Long Watch')).toBe('The Long Watch');
    });

    it('returns null when nothing names the world, so the langpack fallback is used', () => {
        expect(eventTrackerTitleName([], '  ')).toBeNull();
        expect(eventTrackerTitleName([CAMPAIGN], '')).toBeNull();
        expect(eventTrackerTitleName([{ id: 'nameless', label: '' }], '')).toBeNull();
    });

    it("falls back to the world's title when the lone adventure has no name", () => {
        expect(eventTrackerTitleName([{ id: 'nameless', label: ' ' }], 'The Long Watch')).toBe('The Long Watch');
    });
});
