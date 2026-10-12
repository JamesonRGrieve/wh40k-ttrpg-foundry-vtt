/**
 * Stories for EventTrackerDialog — the GM campaign Event Tracker dashboard.
 *
 * The dialog's whole context comes from the pure `buildEventTrackerView`, so the
 * story renders the real header + body PARTS from that function over a seeded
 * snapshot, and wires the same `data-action` / change surface the dialog does:
 * tab switching, campaign-day prev/next (`stepCampaignDay`), toggling an event
 * resolved, and editing a PC attitude (`withPcAttitude`). The `play` function
 * drives all four and asserts the re-rendered DOM. The tracker is world data,
 * not per game line, so no `data-wh40k-system` ancestor is needed; the
 * `.wh40k-rpg` wrapper resolves the scoped `tw-*` utilities.
 */

import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';
import { seedRandom } from '../../../../stories/mocks/extended';
import { initializeStoryHandlebars } from '../../../../stories/template-support';
import { assertActiveTab, renderSheetParts } from '../../../../stories/test-helpers';
import bodySrc from '../../../templates/dialogs/event-tracker/body.hbs?raw';
import headerSrc from '../../../templates/dialogs/event-tracker/header.hbs?raw';
import { type CharacterState, type EventGraph, type PcAttitudeMap, type ResolvedState, stepCampaignDay, withPcAttitude } from '../../managers/event-graph.ts';
import { asEventTrackerTab, buildEventTrackerView, type EventTrackerTab } from './event-tracker-view.ts';

initializeStoryHandlebars();
seedRandom(0xe7e7);

const AT = { resolvedAt: '2026-01-01T00:00:00.000Z' };

const GRAPH: EventGraph = {
    BRIEFING: {
        name: 'Document Review and Cover Story',
        location: '[[The Errant Vector]]',
        source_name: 'Day 0 — Transit and Arrival',
        source_file: 'Days/Day 0.md',
    },
    CREW_MEAL: {
        name: 'Crew Meal and Briefing',
        location: '[[The Errant Vector]]',
        source_name: 'Day 0 — Transit and Arrival',
        source_file: 'Days/Day 0.md',
        requires: 'BRIEFING',
    },
    VISIT_SUMP: {
        name: 'A Drink at the Sump',
        location: '[[The Sump]]',
        source_name: 'Day 1 — First Full Day',
        source_file: 'Days/Day 1.md',
        requires: { all: ['CREW_MEAL', { any: ['BRIEFING', { char: { skill: 'scrutiny' } }] }] },
        excuse: { CREW_MEAL: 'The crew are still at table.' },
        is_day_end: true,
    },
    SICK_CHILD: {
        name: 'The Sick Child',
        source_name: 'The Sick Child',
        source_file: 'Quests/The Sick Child.md',
        requires: 'VISIT_SUMP',
        excuse: 'Nobody has mentioned the child yet.',
    },
};

const CHARACTERS: Record<string, CharacterState> = {
    'Garrick Varo': {
        dispositions: [
            { target: 'party', attitude: 'neutral', default: true, note: 'Not yet met.' },
            { target: 'party', attitude: 'helpful', trigger: 'BRIEFING', note: 'Recognises the cover story.' },
            { target: 'party', attitude: 'hostile', trigger: 'VISIT_SUMP', note: 'Heard what was said at the Sump.' },
        ],
        relationships: [{ target: 'Abel Harsk', type: 'rival', state: 'wary', summary: 'An old grudge.' }],
    },
};

const JOURNALS = new Map([
    ['The Sump', 'JournalEntry.sump'],
    ['Garrick Varo', 'JournalEntry.varo'],
]);

interface TrackerState {
    activeTab: EventTrackerTab;
    campaignDay: number;
    resolved: ResolvedState;
    pcAttitudes: PcAttitudeMap;
}

function initialState(activeTab: EventTrackerTab): TrackerState {
    return { activeTab, campaignDay: 0, resolved: { BRIEFING: AT }, pcAttitudes: { 'Garrick Varo': { Ibnad: 'trusting' } } };
}

function renderInto(root: HTMLElement, state: TrackerState): void {
    const view = buildEventTrackerView({
        graph: GRAPH,
        characters: CHARACTERS,
        resolved: state.resolved,
        campaignDay: state.campaignDay,
        pcAttitudes: state.pcAttitudes,
        pcNames: ['Gus', 'Ibnad'],
        activeTab: state.activeTab,
        activeSceneName: 'The Sump',
        sceneNames: new Set(['The Sump']),
        journalLink: (ref) => JOURNALS.get(ref.name) ?? null,
    });
    root.replaceChildren(
        renderSheetParts(
            [
                { template: headerSrc, context: {} },
                { template: bodySrc, context: {} },
            ],
            { ...view },
        ),
    );
}

/** Mirror of the dialog's action handlers, applied to the story's snapshot. */
function mountTracker(activeTab: EventTrackerTab): HTMLElement {
    const root = document.createElement('div');
    root.className = 'wh40k-rpg event-tracker-dialog';
    const state = initialState(activeTab);
    root.addEventListener('click', (event) => {
        const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-action]') : null;
        if (target === null) return;
        const action = target.dataset['action'];
        if (action === 'selectTab' || action === 'jumpToGroup') state.activeTab = asEventTrackerTab(target.dataset['tab']);
        else if (action === 'stepDay') state.campaignDay = stepCampaignDay(state.campaignDay, Number(target.dataset['delta']));
        else if (action === 'toggleResolved' && target instanceof HTMLInputElement) {
            const id = target.dataset['eventId'] ?? '';
            state.resolved = target.checked
                ? { ...state.resolved, [id]: AT }
                : Object.fromEntries(Object.entries(state.resolved).filter(([key]) => key !== id));
        } else return;
        renderInto(root, state);
    });
    root.addEventListener('change', (event) => {
        const input = event.target;
        if (!(input instanceof HTMLInputElement) || input.dataset['npc'] === undefined || input.dataset['pc'] === undefined) return;
        state.pcAttitudes = withPcAttitude(state.pcAttitudes, input.dataset['npc'], input.dataset['pc'], input.value);
        renderInto(root, state);
    });
    renderInto(root, state);
    return root;
}

const meta = {
    title: 'Dialogs/EventTrackerDialog',
} satisfies Meta;
export default meta;

type Story = StoryObj;

export const Timeline: Story = {
    render: () => mountTracker('timeline'),
    play: async ({ canvasElement }) => {
        assertActiveTab(canvasElement, 'timeline');
        await expect(canvasElement.querySelector('[data-wh40k-hook="evt-day-label"]')?.textContent.trim()).toBe('Day 0');
        await expect(canvasElement.querySelector('[data-wh40k-hook="evt-today"]')).not.toBeNull();
        // The locked event shows its requirement tree, per-leaf excuse and the predicate leaf.
        const requirements = [...canvasElement.querySelectorAll('[data-event-id="VISIT_SUMP"] [data-wh40k-hook="evt-requirement"]')];
        await expect(requirements.length).toBe(5);
        await expect(requirements.some((row) => row.textContent.includes('The crew are still at table.'))).toBe(true);
        // A resolved location renders as a native content link to its journal.
        await expect(canvasElement.querySelector('a.content-link[data-uuid="JournalEntry.sump"]')).not.toBeNull();
    },
};

export const Interactions: Story = {
    render: () => mountTracker('timeline'),
    play: async ({ canvasElement }) => {
        const dayLabel = (): string | undefined => canvasElement.querySelector('[data-wh40k-hook="evt-day-label"]')?.textContent.trim();

        // Day next / prev, clamped at day 0.
        canvasElement.querySelector<HTMLElement>('[data-action="stepDay"][data-delta="1"]')?.click();
        await expect(dayLabel()).toBe('Day 1');
        canvasElement.querySelector<HTMLElement>('[data-action="stepDay"][data-delta="-1"]')?.click();
        await expect(dayLabel()).toBe('Day 0');
        await expect(canvasElement.querySelector<HTMLButtonElement>('[data-action="stepDay"][data-delta="-1"]')?.disabled).toBe(true);

        // Toggle an available event resolved: it unlocks the next one.
        await expect(canvasElement.querySelector<HTMLInputElement>('input[data-event-id="VISIT_SUMP"]')?.disabled).toBe(true);
        canvasElement.querySelector<HTMLInputElement>('input[data-event-id="CREW_MEAL"]')?.click();
        await expect(canvasElement.querySelector<HTMLInputElement>('input[data-event-id="CREW_MEAL"]')?.checked).toBe(true);
        await expect(canvasElement.querySelector<HTMLInputElement>('input[data-event-id="VISIT_SUMP"]')?.disabled).toBe(false);

        // Switch to Location: the active scene sorts first and offers Go to Scene.
        canvasElement.querySelector<HTMLElement>('[data-action="selectTab"][data-tab="location"]')?.click();
        assertActiveTab(canvasElement, 'location');
        const firstGroup = canvasElement.querySelector('[data-wh40k-hook="evt-group"]');
        await expect(firstGroup?.getAttribute('data-group-key')).toBe('The Sump');
        await expect(firstGroup?.querySelector('[data-action="viewScene"]')).not.toBeNull();

        // Switch to Relations and edit a PC attitude.
        canvasElement.querySelector<HTMLElement>('[data-action="selectTab"][data-tab="relations"]')?.click();
        assertActiveTab(canvasElement, 'relations');
        await expect(canvasElement.querySelector('[data-wh40k-hook="evt-npc-attitude"]')?.textContent.trim()).toBe('helpful');
        const gus = canvasElement.querySelector<HTMLInputElement>('[data-wh40k-hook="evt-pc-attitude"][data-pc="Gus"]');
        await expect(gus?.value).toBe('');
        await expect(gus?.placeholder).toBe('Not Met');
        if (gus === null) return;
        gus.value = 'wary';
        gus.dispatchEvent(new Event('change', { bubbles: true }));
        await expect(canvasElement.querySelector<HTMLInputElement>('[data-wh40k-hook="evt-pc-attitude"][data-pc="Gus"]')?.value).toBe('wary');
    },
};

export const Relations: Story = {
    render: () => mountTracker('relations'),
    play: async ({ canvasElement }) => {
        const card = canvasElement.querySelector('[data-wh40k-hook="evt-npc-card"]');
        await expect(card?.querySelector('a.content-link[data-uuid="JournalEntry.varo"]')).not.toBeNull();
        await expect(card?.textContent).toContain('Next shift: hostile (if A Drink at the Sump)');
        await expect(canvasElement.querySelector<HTMLInputElement>('[data-wh40k-hook="evt-pc-attitude"][data-pc="Ibnad"]')?.value).toBe('trusting');
    },
};
