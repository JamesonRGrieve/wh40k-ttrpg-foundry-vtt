import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { clearScreenOverlays, snap } from './lib/screenshot';
import { expect, test } from './lib/test';

/**
 * Tier B screenshot coverage of the GM's Event Tracker dashboard and the actor
 * portrait journal link (#589, #590), driven the way the GM uses them: the
 * dashboard opens from the `game.wh40k.EventTracker.open()` macro surface, and
 * every change below is a real click on the dashboard (day bar, resolve
 * checkbox, Relations attitude field, journal links, Spawn Scene) or on the
 * vehicle sheet's portrait.
 *
 * The campaign graph is seeded onto the tracker's static graph (the vault
 * import's job); everything else is world documents this spec creates and
 * deletes. `managers-extra.spec.ts` keeps the per-flow probes; this spec owns
 * the screenshots for review.
 */

const DASHBOARD = '#wh40k-event-tracker';

/** Names shared by the seeding evaluate and the assertions. */
const SEED = {
    source: 'Day 3 — Tracker Probe Arrival',
    location: 'Tracker Probe Spire',
    locationJournal: 'Tracker Probe Spire (GM notes)',
    npc: 'Tracker Probe Magos Holt',
    pc: 'tracker-probe-acolyte',
    rootEvent: 'evt-probe-arrival',
    lockedEvent: 'evt-probe-audience',
} as const;

interface SeedResult {
    error: string | null;
    sourceJournalUuid: string | null;
    locationJournalUuid: string | null;
    npcJournalUuid: string | null;
}

/** Seed the tracker graph, the reference journals and a PC; stash every created id for {@link teardown}. */
async function seedTracker(page: Page): Promise<SeedResult> {
    return page.evaluate(async (seed): Promise<SeedResult> => {
        interface Doc {
            id: string;
            uuid: string;
            delete: () => Promise<object>;
        }
        interface Tracker {
            _graph: object | null;
            _characters: object | null;
            getCampaignDay: () => number;
            setCampaignDay: (day: number) => Promise<void>;
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals (game, Actor, JournalEntry) have no browser-side types
        const g = globalThis as unknown as {
            game: { wh40k: { EventTracker: Tracker } };
            Actor: { create: (data: object) => Promise<Doc | null> };
            JournalEntry: { create: (data: object) => Promise<Doc | null> };
            __eventTrackerProbe?: { docs: Doc[]; graph: object | null; characters: object | null; day: number };
        };
        try {
            const ET = g.game.wh40k.EventTracker;
            const docs: Doc[] = [];
            g.__eventTrackerProbe = { docs, graph: ET._graph, characters: ET._characters, day: ET.getCampaignDay() };
            const journal = async (name: string, vault?: object): Promise<Doc | null> => {
                const doc = await g.JournalEntry.create({ name, ...(vault === undefined ? {} : { flags: { 'wh40k-rpg': { vault } } }) });
                if (doc !== null) docs.push(doc);
                return doc;
            };
            const sourceJournal = await journal(seed.source);
            const locationJournal = await journal(seed.locationJournal, { path: `Locations/${seed.location}.md`, entityType: 'location', name: seed.location });
            const npcJournal = await journal(seed.npc);
            const pc = await g.Actor.create({ name: seed.pc, type: 'dh2-character', system: { gameSystem: 'dh2' } });
            if (pc !== null) docs.push(pc);
            ET._graph = {
                [seed.rootEvent]: { id: seed.rootEvent, name: 'The warband lands at the Spire', location: seed.location, source_name: seed.source },
                [seed.lockedEvent]: {
                    id: seed.lockedEvent,
                    name: 'Audience with the Magos',
                    location: seed.location,
                    source_name: seed.source,
                    requires: seed.rootEvent,
                },
            };
            ET._characters = {
                [seed.npc]: {
                    dispositions: [
                        { target: 'party', attitude: 'wary', default: true },
                        { target: 'party', attitude: 'friendly', trigger: seed.lockedEvent },
                    ],
                    relationships: [],
                },
            };
            await ET.setCampaignDay(3);
            return {
                error: null,
                sourceJournalUuid: sourceJournal?.uuid ?? null,
                locationJournalUuid: locationJournal?.uuid ?? null,
                npcJournalUuid: npcJournal?.uuid ?? null,
            };
        } catch (err) {
            return { error: err instanceof Error ? err.message : String(err), sourceJournalUuid: null, locationJournalUuid: null, npcJournalUuid: null };
        }
    }, SEED);
}

/** Close the dashboard, restore the tracker state and delete every document the spec made. */
async function teardown(page: Page): Promise<void> {
    await page.evaluate(async (seed) => {
        interface Tracker {
            _graph: object | null;
            _characters: object | null;
            setCampaignDay: (day: number) => Promise<void>;
            setResolved: (id: string, resolved: boolean) => Promise<void>;
            setPcAttitude: (npc: string, pc: string, attitude: string) => Promise<void>;
        }
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals (game, foundry.applications) have no browser-side types
        const g = globalThis as unknown as {
            game: { wh40k: { EventTracker: Tracker }; scenes: { getName: (name: string) => { delete: () => Promise<object> } | undefined } };
            foundry: { applications: { instances: Map<string, { close: () => Promise<object> }> } };
            __eventTrackerProbe?: { docs: Array<{ delete: () => Promise<object> }>; graph: object | null; characters: object | null; day: number };
        };
        const probe = g.__eventTrackerProbe;
        const ET = g.game.wh40k.EventTracker;
        try {
            await g.foundry.applications.instances.get('wh40k-event-tracker')?.close();
            await ET.setResolved(seed.rootEvent, false);
            await ET.setResolved(seed.lockedEvent, false);
            await ET.setPcAttitude(seed.npc, seed.pc, '');
            await g.game.scenes.getName(seed.location)?.delete();
            if (probe !== undefined) {
                await ET.setCampaignDay(probe.day);
                for (const doc of probe.docs) {
                    // eslint-disable-next-line no-await-in-loop -- sequential teardown of the probe's own documents
                    await doc.delete();
                }
            }
        } finally {
            if (probe !== undefined) {
                ET._graph = probe.graph;
                ET._characters = probe.characters;
            }
            g.__eventTrackerProbe = undefined;
        }
    }, SEED);
}

/** Open the dashboard through the macro surface and wait for its timeline rows. */
async function openDashboard(page: Page): Promise<void> {
    await page.evaluate(() => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
        (globalThis as unknown as { game: { wh40k: { EventTracker: { open: () => void } } } }).game.wh40k.EventTracker.open();
    });
    await page.locator(`${DASHBOARD} [data-wh40k-hook="evt-row"]`).first().waitFor();
}

/** Snap the dashboard window alone, with every other floating window closed. */
async function snapDashboard(page: Page, label: string): Promise<void> {
    await clearScreenOverlays(page, 'wh40k-event-tracker');
    const shot = await snap(page, label, { selector: DASHBOARD });
    expect(shot, `${label} screenshot`).not.toBeNull();
}

test.describe.serial('Event Tracker dashboard (Tier B, #589 / #590)', () => {
    test('timeline, day bar and resolving an event unlock its dependant and shift the NPC attitude', async ({ page }) => {
        await joinOrSkip(page);
        const seeded = await seedTracker(page);
        try {
            expect(seeded.error, seeded.error ?? '').toBeNull();
            await openDashboard(page);
            const dashboard = page.locator(DASHBOARD);
            const dayLabel = dashboard.locator('[data-wh40k-hook="evt-day-label"]');
            const locked = dashboard.locator(`[data-event-id="${SEED.lockedEvent}"]`);

            await expect(dayLabel).toHaveText('Day 3');
            await expect(locked.locator('[data-wh40k-hook="evt-requirement"]')).toBeVisible();
            await expect(dashboard.locator('[data-wh40k-hook="evt-today"]')).toBeVisible();
            await snapDashboard(page, 'event-tracker-dashboard-timeline');

            await dashboard.locator('[data-action="stepDay"][data-delta="1"]').click();
            await expect(dayLabel).toHaveText('Day 4');
            await snapDashboard(page, 'event-tracker-day-stepped-forward');
            await dashboard.locator('[data-action="stepDay"][data-delta="-1"]').click();
            await expect(dayLabel).toHaveText('Day 3');

            await dashboard.locator(`[data-action="toggleResolved"][data-event-id="${SEED.rootEvent}"]`).check();
            await expect(dashboard.locator(`[data-action="toggleResolved"][data-event-id="${SEED.rootEvent}"]`)).toBeChecked();
            await expect(locked.locator('[data-wh40k-hook="evt-requirement"]')).toHaveCount(0);
            await snapDashboard(page, 'event-tracker-root-resolved-dependant-unlocked');

            await dashboard.locator(`[data-action="toggleResolved"][data-event-id="${SEED.lockedEvent}"]`).check();
            await dashboard.locator('[data-action="selectTab"][data-tab="relations"]').click();
            const npcCard = dashboard.locator(`[data-wh40k-hook="evt-npc-card"][data-npc="${SEED.npc}"]`);
            await expect(npcCard.locator('[data-wh40k-hook="evt-npc-attitude"]')).toHaveText(/friendly/iu);
            await snapDashboard(page, 'event-tracker-relations-attitude-shifted');
            recordCoverage('event-tracker.flow', 'timeline-day-resolve');
        } finally {
            await teardown(page);
        }
    });

    test("editing a PC's attitude on the Relations tab persists it", async ({ page }) => {
        await joinOrSkip(page);
        const seeded = await seedTracker(page);
        try {
            expect(seeded.error, seeded.error ?? '').toBeNull();
            await openDashboard(page);
            const dashboard = page.locator(DASHBOARD);
            await dashboard.locator('[data-action="selectTab"][data-tab="relations"]').click();
            const input = dashboard.locator(`[data-wh40k-hook="evt-pc-attitude"][data-npc="${SEED.npc}"][data-pc="${SEED.pc}"]`);
            await input.fill('hostile');
            await input.press('Tab');
            await expect
                .poll(async () =>
                    page.evaluate((seed) => {
                        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
                        const g = globalThis as unknown as { game: { wh40k: { EventTracker: { getPcAttitudes: (npc: string) => Record<string, string> } } } };
                        return g.game.wh40k.EventTracker.getPcAttitudes(seed.npc)[seed.pc] ?? '';
                    }, SEED),
                )
                .toBe('hostile');
            await expect(dashboard.locator(`[data-wh40k-hook="evt-pc-attitude"][data-pc="${SEED.pc}"]`)).toHaveValue('hostile');
            await snapDashboard(page, 'event-tracker-pc-attitude-edited');
            recordCoverage('event-tracker.flow', 'pc-attitude-edit');
        } finally {
            await teardown(page);
        }
    });

    test('journal links open their journal; a location without a scene offers Spawn Scene, then Go to Scene', async ({ page }) => {
        await joinOrSkip(page);
        const seeded = await seedTracker(page);
        try {
            expect(seeded.error, seeded.error ?? '').toBeNull();
            await openDashboard(page);
            const dashboard = page.locator(DASHBOARD);

            const sourceLink = dashboard.locator(`a.content-link[data-wh40k-hook="evt-journal-link"][data-uuid="${seeded.sourceJournalUuid ?? ''}"]`).first();
            await expect(sourceLink).toBeVisible();
            await sourceLink.click();
            const sourceSheet = page.locator(`[id$="JournalEntry-${(seeded.sourceJournalUuid ?? '').split('.').at(-1) ?? ''}"]`);
            await expect(sourceSheet).toBeVisible();
            await clearScreenOverlays(page, (seeded.sourceJournalUuid ?? '').split('.').at(-1));
            expect(
                await snap(page, 'event-tracker-journal-link-opened', {
                    selector: `[id$="JournalEntry-${(seeded.sourceJournalUuid ?? '').split('.').at(-1) ?? ''}"]`,
                }),
            ).not.toBeNull();

            await openDashboard(page);
            await dashboard.locator('[data-action="selectTab"][data-tab="location"]').click();
            const locationLink = dashboard.locator(`a.content-link[data-uuid="${seeded.locationJournalUuid ?? ''}"]`).first();
            await expect(locationLink, 'the location resolves by its vault identity although the journal was renamed').toBeVisible();
            const spawn = dashboard.locator(`[data-action="spawnScene"][data-location="${SEED.location}"]`);
            await expect(spawn).toBeVisible();
            await snapDashboard(page, 'event-tracker-location-spawn-offered');
            await spawn.click();
            await expect(dashboard.locator(`[data-action="viewScene"][data-location="${SEED.location}"]`)).toBeVisible();
            const stamped = await page.evaluate((seed) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `game` global has no browser-side types
                const g = globalThis as unknown as {
                    game: { scenes: { getName: (n: string) => { flags: { 'wh40k-rpg'?: { vault?: { name?: string } } } } | undefined } };
                };
                return g.game.scenes.getName(seed.location)?.flags['wh40k-rpg']?.vault?.name ?? null;
            }, SEED);
            expect(stamped, 'the spawned scene carries the location journal vault identity').toBe(SEED.location);
            await snapDashboard(page, 'event-tracker-location-scene-spawned');
            recordCoverage('event-tracker.flow', 'journal-links-spawn-scene');
        } finally {
            await teardown(page);
        }
    });

    test('a vehicle sheet portrait carries the journal link, which opens its journal (#590)', async ({ page }) => {
        await joinOrSkip(page);
        const ids = await page.evaluate(async () => {
            interface Doc {
                id: string;
                sheet: { render: (force: boolean) => Promise<object>; id: string; setPosition: (position: { left: number; top: number }) => void };
                delete: () => Promise<object>;
            }
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals (Actor, JournalEntry) have no browser-side types
            const g = globalThis as unknown as {
                Actor: { create: (data: object) => Promise<Doc | null> };
                JournalEntry: { create: (data: object) => Promise<Doc | null> };
                __vehicleJournalProbe?: Doc[];
            };
            const name = 'Tracker Probe Rhino';
            const journal = await g.JournalEntry.create({
                name,
                flags: { 'wh40k-rpg': { vault: { path: `Locations/${name}.md`, entityType: 'vehicle', name } } },
            });
            const vehicle = await g.Actor.create({ name, type: 'dh2-vehicle', system: { gameSystem: 'dh2' } });
            g.__vehicleJournalProbe = [journal, vehicle].filter((d): d is Doc => d !== null);
            if (vehicle === null || journal === null) return { error: 'vehicle / journal create failed', sheetId: '', journalId: '' };
            await vehicle.sheet.render(true);
            // Clear of the In-Universe Time HUD widget, which sits over the top-left of the canvas and is not a floating window.
            vehicle.sheet.setPosition({ left: 380, top: 10 });
            return { error: null, sheetId: vehicle.sheet.id, journalId: journal.id };
        });
        try {
            expect(ids.error, ids.error ?? '').toBeNull();
            const sheet = page.locator(`#${ids.sheetId}`);
            const open = sheet.locator('[data-wh40k-hook="portrait-journal-controls"] [data-action="openPortraitJournal"]');
            await expect(open).toBeVisible();
            await clearScreenOverlays(page, ids.sheetId);
            expect(await snap(page, 'vehicle-portrait-journal-icon', { selector: `#${ids.sheetId}` })).not.toBeNull();
            expect(
                await snap(page, 'vehicle-portrait-journal-icon-closeup', {
                    selector: `#${ids.sheetId} :has(> [data-wh40k-hook="portrait-journal-controls"])`,
                }),
            ).not.toBeNull();
            await open.click();
            const journalSheet = page.locator(`[id$="JournalEntry-${ids.journalId}"]`);
            await expect(journalSheet).toBeVisible();
            await clearScreenOverlays(page, ids.journalId);
            expect(await snap(page, 'vehicle-portrait-journal-opened', { selector: `[id$="JournalEntry-${ids.journalId}"]` })).not.toBeNull();
            recordCoverage('event-tracker.flow', 'vehicle-portrait-journal');
        } finally {
            await page.evaluate(async () => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: reading the probe documents stashed on globalThis across evaluate calls
                const g = globalThis as unknown as { __vehicleJournalProbe?: Array<{ delete: () => Promise<object> }> };
                for (const doc of g.__vehicleJournalProbe ?? []) {
                    // eslint-disable-next-line no-await-in-loop -- sequential teardown of the probe's own documents
                    await doc.delete();
                }
                g.__vehicleJournalProbe = undefined;
            });
        }
    });
});
