/**
 * Event Tracker dashboard templates, rendered from the real view model.
 *
 * `buildEventTrackerView` decides everything the dashboard shows; these tests
 * render the dialog's header + body PARTS (and their partials) from it and
 * assert the DOM the dialog's actions and change listener depend on.
 */

import { describe, expect, it } from 'vitest';
import { buildEventTrackerView, type EventTrackerTab } from '../src/module/applications/dialogs/event-tracker-view.ts';
import type { EventGraph } from '../src/module/managers/event-graph.ts';
import bodySrc from '../src/templates/dialogs/event-tracker/body.hbs?raw';
import headerSrc from '../src/templates/dialogs/event-tracker/header.hbs?raw';
import { initializeStoryHandlebars } from '../stories/template-support';
import { renderSheetParts } from '../stories/test-helpers';

initializeStoryHandlebars();

const AT = { resolvedAt: '2026-01-01T00:00:00.000Z' };

const GRAPH: EventGraph = {
    BRIEFING: { name: 'Document Review', location: '[[The Errant Vector]]', source_name: 'Day 0 — Transit', source_file: 'Days/Day 0.md' },
    SUMP: {
        name: 'A Drink at the Sump',
        location: '[[The Sump]]',
        source_name: 'Day 1 — First Day',
        source_file: 'Days/Day 1.md',
        requires: { all: ['BRIEFING', { any: ['MISSING', { char: { skill: 'scrutiny' } }] }] },
    },
    AUTO: { name: 'Auto Event', source_name: 'Day 0 — Transit', source_file: 'Days/Day 0.md' },
};

function render(activeTab: EventTrackerTab, campaignDay = 0): HTMLElement {
    const view = buildEventTrackerView({
        graph: GRAPH,
        characters: { 'Garrick Varo': { dispositions: [{ attitude: 'neutral', default: true, note: 'Not met.' }] } },
        resolved: { BRIEFING: AT, AUTO: { ...AT, origin: 'auto', detail: 'scene entered' } },
        campaignDay,
        pcAttitudes: { 'Garrick Varo': { Ibnad: 'trusting' } },
        pcNames: ['Gus', 'Ibnad'],
        activeTab,
        activeSceneName: '',
        sceneNames: new Set(['The Sump']),
        journalLink: (ref) => (ref.name === 'The Sump' ? 'JournalEntry.sump' : null),
    });
    return renderSheetParts(
        [
            { template: headerSrc, context: {} },
            { template: bodySrc, context: {} },
        ],
        { ...view },
    );
}

describe('Event Tracker dashboard templates', () => {
    it('renders the day bar, tabs, stats and timeline rows', () => {
        const root = render('timeline', 101);
        expect(root.querySelector('[data-wh40k-hook="evt-day-label"]')?.textContent.trim()).toBe('Day M1');
        expect(root.querySelector('[data-action="selectTab"][data-tab="timeline"]')?.classList.contains('active')).toBe(true);
        expect(root.querySelector('[data-wh40k-hook="evt-stats"]')?.textContent.trim()).toBe('2/3 resolved · 0 available now');
        expect(root.querySelector<HTMLInputElement>('input[data-action="toggleResolved"][data-event-id="BRIEFING"]')?.checked).toBe(true);
        expect(root.querySelector<HTMLInputElement>('input[data-event-id="SUMP"]')?.disabled).toBe(true);
        expect(root.querySelector('[data-event-id="AUTO"] [data-wh40k-hook="evt-auto-resolved"]')?.textContent.trim()).toBe(
            'resolved automatically: scene entered',
        );
    });

    it('renders the requirement tree with cross-tab jumps and the predicate leaf', () => {
        const rows = [...render('timeline').querySelectorAll('[data-event-id="SUMP"] [data-wh40k-hook="evt-requirement"]')].map((row) =>
            row.textContent.replace(/\s+/g, ' ').trim(),
        );
        expect(rows).toEqual([
            'Requires all:',
            '✓ Document Review at The Errant Vector on Day 0 or later',
            'Requires any:',
            '○ MISSING',
            '○ Character — skill: scrutiny',
        ]);
        const jump = render('timeline').querySelector('[data-action="jumpToGroup"][data-tab="location"]');
        expect(jump?.getAttribute('data-group')).toBe('The Errant Vector');
    });

    it('renders resolved names as Foundry content links and the rest as plain text', () => {
        const root = render('location');
        const link = root.querySelector('a.content-link[data-link][data-uuid="JournalEntry.sump"]');
        expect(link?.textContent.trim()).toBe('The Sump');
        expect(root.querySelector('[data-group-key="The Errant Vector"] h3 a')).toBeNull();
        expect(root.querySelector('[data-group-key="The Sump"] [data-action="viewScene"]')?.getAttribute('data-location')).toBe('The Sump');
        expect(root.querySelector('[data-group-key="The Errant Vector"] [data-action="spawnScene"]')).not.toBeNull();
        expect(root.querySelector('[data-wh40k-hook="evt-stats"]')).not.toBeNull();
    });

    it('renders the Relations tab with editable, labelled attitude inputs', () => {
        const root = render('relations');
        expect(root.querySelector('[data-wh40k-hook="evt-stats"]')).toBeNull();
        expect(root.querySelector('[data-wh40k-hook="evt-npc-attitude"]')?.textContent.trim()).toBe('neutral');
        const inputs = [...root.querySelectorAll<HTMLInputElement>('[data-wh40k-hook="evt-pc-attitude"]')];
        expect(inputs.map((input) => [input.dataset['npc'], input.dataset['pc'], input.value, input.placeholder, input.getAttribute('aria-label')])).toEqual([
            ['Garrick Varo', 'Gus', '', 'Not Met', 'Gus'],
            ['Garrick Varo', 'Ibnad', 'trusting', 'Not Met', 'Ibnad'],
        ]);
    });
});
