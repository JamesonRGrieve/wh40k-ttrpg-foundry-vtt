import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { assertFlowResults } from './lib/flow-assert';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B coverage of the Event Tracker's window title (#618,
 * src/module/applications/dialogs/event-tracker-dialog.ts `title`).
 *
 * The title used to read "Solenne Campaign — Event Tracker" in every world. It now
 * names what the tracker loaded: a world holding only an imported adventure (the
 * Ashford Mill fixture) is titled after that adventure, and once a campaign graph is
 * loaded the world's own title names it. Both dashboards are captured.
 *
 * Each flow records under `event-tracker-title.flow`. Keys MUST match
 * EVENT_TRACKER_TITLE_FLOWS in scripts/e2e-coverage.mjs.
 */

const EVENT_TRACKER_TITLE_FLOWS = ['adventure-world-titled-after-adventure', 'campaign-world-titled-after-world'] as const;
type FlowName = (typeof EVENT_TRACKER_TITLE_FLOWS)[number];

const DASHBOARD = '#wh40k-event-tracker';
const FIXTURE = resolve(__dirname, '..', 'fixtures', 'adventure-packs', 'homebrew', 'hb-dh2-adventures', '_source', 'the-ashford-mill_ashfordMillAdv01.json');

interface Doc {
    id: string;
    flags: Record<string, Record<string, object | undefined> | undefined>;
    delete: () => Promise<object>;
}

interface Tracker {
    _graph: object | null;
    _characters: object | null;
    sources: ReadonlyArray<{ id: string; label: string }>;
    loadGraph: () => Promise<void>;
    open: () => void;
}

interface Globals {
    game: { wh40k: { EventTracker: Tracker }; world: { title: string }; journal: { contents: Doc[] } };
    JournalEntry: { create: (d: object) => Promise<Doc | null>; createDocuments: (d: object[], o: object) => Promise<Doc[]> };
    foundry: { applications: { instances: Map<string, { close: () => Promise<object> }> } };
    __trackerTitleProbe?: { docs: Doc[]; hidden: Array<{ doc: Doc; payload: object }> };
}

interface TitleRead {
    title: string;
    worldTitle: string;
    sources: Array<{ id: string; label: string }>;
}

/** (Re)load the graph, open the dashboard and read its window title. */
async function openAndReadTitle(page: Page): Promise<TitleRead> {
    return page.evaluate(async (dashboard: string) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as Globals;
        const ET = g.game.wh40k.EventTracker;
        await g.foundry.applications.instances.get('wh40k-event-tracker')?.close();
        await ET.loadGraph();
        ET.open();
        const { waitFor, settle, scaledMs: scale } = globalThis.wh40kE2E;
        await waitFor(() => document.querySelector(`${dashboard} [data-wh40k-hook="evt-row"]`) !== null, 'event tracker rows', scale(10_000));
        await settle(300);
        return {
            title: document.querySelector(`${dashboard} .window-header .window-title`)?.textContent.trim() ?? '',
            worldTitle: g.game.world.title,
            sources: ET.sources.map((source) => ({ id: source.id, label: source.label })),
        };
    }, DASHBOARD);
}

test.describe.serial('Event Tracker window title (Tier B, #618)', () => {
    test.setTimeout(scaledMs(180_000));
    test('an adventure world is titled after its adventure, a campaign world after the world', async ({ page }) => {
        await joinOrSkip(page);
        const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as { journal: object[] };
        const results: Array<{ name: FlowName; ok: boolean; detail: string | null }> = [];
        const record = (name: FlowName, ok: boolean, detail: string): void => {
            results.push({ name, ok, detail: ok ? null : detail });
        };
        try {
            // An adventure world: only the imported adventure's graph. Any campaign graph a
            // previous spec left in this world is set aside for the duration.
            await page.evaluate(async (journals: object[]) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
                const g = globalThis as unknown as Globals;
                const hidden: Array<{ doc: Doc; payload: object }> = [];
                for (const entry of g.game.journal.contents) {
                    const scope = entry.flags['wh40k-rpg'];
                    const payload = scope?.['eventGraph'];
                    if (scope === undefined || payload === undefined) continue;
                    hidden.push({ doc: entry, payload });
                    delete scope['eventGraph'];
                }
                const docs = await g.JournalEntry.createDocuments(journals, { keepId: true });
                g.__trackerTitleProbe = { docs, hidden };
            }, fixture.journal);
            const adventure = await openAndReadTitle(page);
            const onlyAdventure = adventure.sources.length === 1 ? adventure.sources[0] : undefined;
            record(
                'adventure-world-titled-after-adventure',
                onlyAdventure !== undefined &&
                    onlyAdventure.id !== '' &&
                    adventure.title === `${onlyAdventure.label} — Event Tracker` &&
                    !adventure.title.includes('Solenne'),
                `title "${adventure.title}", sources ${JSON.stringify(adventure.sources)}`,
            );
            await snap(page, 'event-tracker-title-adventure-world', { selector: DASHBOARD, closeWindows: true, keepWindow: 'wh40k-event-tracker' });

            // A campaign world: a GM-only campaign graph joins the adventure's.
            await page.evaluate(async () => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
                const g = globalThis as unknown as Globals;
                const graph = await g.JournalEntry.create({
                    name: 'E2E campaign event graph',
                    ownership: { default: 0 },
                    flags: {
                        'wh40k-rpg': {
                            eventGraph: {
                                version: 1,
                                events: { 'evt-e2e-title-briefing': { id: 'evt-e2e-title-briefing', name: 'Briefing', source_name: 'Day 0 — Arrival' } },
                                characters: {},
                            },
                        },
                    },
                });
                if (graph !== null) g.__trackerTitleProbe?.docs.push(graph);
            });
            const campaign = await openAndReadTitle(page);
            record(
                'campaign-world-titled-after-world',
                campaign.sources.some((source) => source.id === '') &&
                    campaign.title === `${campaign.worldTitle} — Event Tracker` &&
                    !campaign.title.includes('Solenne'),
                `title "${campaign.title}", world "${campaign.worldTitle}", sources ${JSON.stringify(campaign.sources)}`,
            );
            await snap(page, 'event-tracker-title-campaign-world', { selector: DASHBOARD, closeWindows: true, keepWindow: 'wh40k-event-tracker' });
        } finally {
            await page.evaluate(async () => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
                const g = globalThis as unknown as Globals;
                const probe = g.__trackerTitleProbe;
                await g.foundry.applications.instances.get('wh40k-event-tracker')?.close();
                for (const doc of probe?.docs ?? []) {
                    // eslint-disable-next-line no-await-in-loop -- sequential teardown of the probe's own documents
                    await doc.delete().catch(() => undefined);
                }
                for (const { doc, payload } of probe?.hidden ?? []) {
                    const scope = doc.flags['wh40k-rpg'];
                    if (scope !== undefined) scope['eventGraph'] = payload;
                }
                g.__trackerTitleProbe = undefined;
                await g.game.wh40k.EventTracker.loadGraph();
            });
        }
        assertFlowResults({ results }, EVENT_TRACKER_TITLE_FLOWS, { dimension: 'event-tracker-title.flow', label: 'event tracker title' });
    });
});
