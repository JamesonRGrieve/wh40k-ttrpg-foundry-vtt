import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { popOutChatMessage } from './lib/chat-capture';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { snap } from './lib/screenshot';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B coverage of three Event Tracker / journal features, each driven the way
 * the table meets it:
 *
 * - **Completion hooks (#591)** — an event whose `completion` trigger is "the PC
 *   acquires the Bolas" resolves itself when the Bolas lands on the PC's sheet, and
 *   the GM is whispered a card naming the event and the trigger. When the GM
 *   un-resolves it, a second Bolas does not resolve it again (the undo persists).
 * - **Adventure graphs (#592)** — the journals of an imported Adventure (the Ashford
 *   Mill test fixture) carry a scenario page; reloading the tracker lists the
 *   adventure as a graph and its events on the dashboard.
 * - **Portrait journal link (#590)** — a PC whose name matches a journal entry gets
 *   a journal icon on its sheet portrait, and clicking it opens that entry.
 *
 * The auto-resolution card, the dashboard with the adventure, the PC portrait with
 * its icon and the opened journal are captured.
 *
 * Each flow records under `event-tracker-auto.flow`. Keys MUST match
 * EVENT_TRACKER_AUTO_FLOWS in scripts/e2e-coverage.mjs.
 */

const EVENT_TRACKER_AUTO_FLOWS = ['item-acquired-auto-resolves', 'gm-undo-persists', 'adventure-graph-loads', 'pc-portrait-journal-opens'] as const;

type FlowName = (typeof EVENT_TRACKER_AUTO_FLOWS)[number];

const BOLAS = 'Compendium.wh40k-rpg.dh2-core-items-weapons.Item.1w94jpt1uzmfph00';
const PC_NAME = 'E2E Tracker Acolyte';
/**
 * Unique per run. The tracker's resolved and suppressed sets are world settings that
 * outlive the spec, and this spec deliberately leaves the event suppressed (the GM's
 * undo), so a fixed id made the next run's first acquisition a no-op.
 */
const EVENT_ID = `evt-e2e-recover-bolas-${Date.now().toString(36)}`;
const DASHBOARD = '#wh40k-event-tracker';
/**
 * How long an acquisition may take to resolve its event (and how long a suppressed
 * one is watched for NOT resolving). Generous: the first run resolved after the
 * earlier 5 s wait had already given up.
 */
const ACQUIRE_WAIT_MS = 20_000;
const FIXTURE = resolve(__dirname, '..', 'fixtures', 'adventure-packs', 'homebrew', 'hb-dh2-adventures', '_source', 'the-ashford-mill_ashfordMillAdv01.json');

interface AdventureFixture {
    journal: object[];
}

interface Doc {
    id: string;
    uuid: string;
    name: string;
    delete: () => Promise<object>;
}

interface ActorDoc extends Doc {
    createEmbeddedDocuments: (type: string, data: object[]) => Promise<Doc[]>;
    sheet: { id: string; rendered: boolean; render: (o: { force: boolean }) => Promise<object> };
}

interface Tracker {
    _graph: object | null;
    _characters: object | null;
    sources: ReadonlyArray<{ id: string; label: string }>;
    loadGraph: () => Promise<void>;
    getResolved: () => Record<string, { origin?: string } | undefined>;
    getAutoSuppressed: () => string[];
    isAvailable: (id: string) => boolean;
    setResolved: (id: string, resolved: boolean, options?: object) => Promise<void>;
    open: () => void;
}

interface Globals {
    game: {
        wh40k: { EventTracker: Tracker };
        messages: { contents: Doc[] };
        actors: { get: (id: string) => ActorDoc | undefined; contents: ActorDoc[] };
        users: { activeGM?: { isSelf: boolean } | null };
    };
    Hooks: {
        on: (hook: string, fn: (item: { name: string; parent: object | null }) => void) => number;
        off: (hook: string, id: number) => void;
    };
    Actor: { create: (d: object) => Promise<ActorDoc | null> };
    JournalEntry: { create: (d: object) => Promise<Doc | null>; createDocuments: (d: object[], o: object) => Promise<Doc[]> };
    foundry: { applications: { instances: Map<string, { id: string; close: () => Promise<object> }> } };
    __trackerAutoProbe?: { docs: Doc[]; graph: object | null; characters: object | null };
}

/** Create the PC and its same-named journal; seed a graph whose one event completes when the PC acquires the Bolas. */
async function seed(page: Page): Promise<{ actorId: string } | { error: string }> {
    return page.evaluate(
        async (args: { pc: string; eventId: string; bolas: string }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as Globals;
            const ET = g.game.wh40k.EventTracker;
            const docs: Doc[] = [];
            g.__trackerAutoProbe = { docs, graph: ET._graph, characters: ET._characters };
            const actor = await g.Actor.create({ name: args.pc, type: 'dh2-character' });
            if (actor === null) return { error: 'Actor.create returned null' };
            docs.push(actor);
            const journal = await g.JournalEntry.create({
                name: args.pc,
                pages: [{ name: 'Dossier', type: 'text', text: { content: '<p>Sworn to the Ordos. Carries a snare of braided wire.</p>' } }],
            });
            if (journal !== null) docs.push(journal);
            // The campaign graph as deploy writes it: a GM-only journal flagged with the
            // exported payload, whose trigger references are already parsed (export_events.py).
            const graphJournal = await g.JournalEntry.create({
                name: 'E2E event graph',
                ownership: { default: 0 },
                flags: {
                    'wh40k-rpg': {
                        eventGraph: {
                            version: 1,
                            events: {
                                [args.eventId]: {
                                    id: args.eventId,
                                    name: 'Recover the Bolas',
                                    completion: [
                                        { kind: 'item-acquired', item: { uuid: args.bolas }, holder: { name: args.pc, path: `Characters/${args.pc}.md` } },
                                    ],
                                },
                            },
                            characters: {},
                        },
                    },
                },
            });
            if (graphJournal !== null) docs.push(graphJournal);
            await ET.loadGraph();
            if (ET._graph === null || !(args.eventId in ET._graph)) return { error: 'the seeded event graph did not load' };
            return { actorId: actor.id };
        },
        { pc: PC_NAME, eventId: EVENT_ID, bolas: BOLAS },
    );
}

/** Give the PC a lean Bolas; return the ids of the chat messages that followed within the wait. */
async function acquireBolas(
    page: Page,
    actorId: string,
): Promise<{ resolved: boolean; origin: string | null; messages: string[]; elapsedMs: number; diagnosis: string }> {
    return page.evaluate(
        async (args: { actorId: string; eventId: string; bolas: string; waitMs: number }) => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
            const g = globalThis as unknown as Globals;
            const { pollUntil, settle } = globalThis.wh40kE2E;
            const before = new Set(g.game.messages.contents.map((m) => m.id));
            // What the watcher sees for this acquisition, so a miss says which half of the trigger failed.
            interface Identified {
                name: string;
                sources: string[];
            }
            interface CompletionModule {
                identifyDoc: (doc: object, legacy: string | undefined) => Identified;
                identifyActor: (actor: object) => Identified;
            }
            interface GraphModule {
                createRefResolver: (candidates: (collection: string) => Iterable<Identified>) => object;
                triggerFires: (trigger: object, change: object, resolver: object) => boolean;
            }
            const moduleRoot = '/systems/wh40k-rpg/module/managers';
            const completion = (await import(/* @vite-ignore */ `${moduleRoot}/event-completion.js`)) as CompletionModule;
            const graphModule = (await import(/* @vite-ignore */ `${moduleRoot}/event-graph.js`)) as GraphModule;
            const seen: string[] = [];
            const hooks = g.Hooks;
            const hookId = hooks.on('createItem', (item) => {
                const ET0 = g.game.wh40k.EventTracker;
                const event = (ET0._graph as Record<string, { completion?: object[] }> | null)?.[args.eventId];
                const trigger = event?.completion?.[0];
                if (item.parent === null || trigger === undefined) {
                    seen.push(`${item.name}: parent ${String(item.parent !== null)}, event in graph ${String(event !== undefined)}`);
                    return;
                }
                const change = { kind: 'item-acquired', item: completion.identifyDoc(item, undefined), holder: completion.identifyActor(item.parent) };
                const resolver = graphModule.createRefResolver((collection) =>
                    collection === 'actor' ? g.game.actors.contents.map((a) => completion.identifyActor(a)) : [],
                );
                seen.push(
                    `${item.name}: sources ${JSON.stringify(change.item.sources)}, holder ${change.holder.name}, fires ${String(
                        graphModule.triggerFires(trigger, change, resolver),
                    )}, available ${String(ET0.isAvailable(args.eventId))}, suppressed ${String(ET0.getAutoSuppressed().includes(args.eventId))}`,
                );
            });
            // When the tracker reports the event resolved, relative to the acquisition.
            const started = Date.now();
            const resolvedHook = hooks.on('wh40k-rpg.eventResolved', () => {
                seen.push(`eventResolved fired at ${Date.now() - started} ms`);
            });
            await g.game.actors
                .get(args.actorId)
                ?.createEmbeddedDocuments('Item', [{ name: 'Bolas', type: 'weapon', _stats: { compendiumSource: args.bolas }, system: {} }]);
            const ET = g.game.wh40k.EventTracker;
            const resolved = await pollUntil(() => ET.getResolved()[args.eventId] !== undefined, args.waitMs);
            const elapsedMs = Date.now() - started;
            // Give the whispered card time to post (or, when suppressed, to not post).
            await settle(800);
            hooks.off('createItem', hookId);
            hooks.off('wh40k-rpg.eventResolved', resolvedHook);
            seen.push(`activeGM self ${String(g.game.users.activeGM?.isSelf)}`);
            const diagnosis = seen.join(' | ');
            return {
                resolved,
                origin: ET.getResolved()[args.eventId]?.origin ?? null,
                messages: g.game.messages.contents.map((m) => m.id).filter((id) => !before.has(id)),
                elapsedMs,
                diagnosis,
            };
        },
        { actorId, eventId: EVENT_ID, bolas: BOLAS, waitMs: scaledMs(ACQUIRE_WAIT_MS) },
    );
}

async function teardown(page: Page): Promise<void> {
    await page.evaluate(async (eventId: string) => {
        // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
        const g = globalThis as unknown as Globals;
        const probe = g.__trackerAutoProbe;
        const ET = g.game.wh40k.EventTracker;
        try {
            await g.foundry.applications.instances.get('wh40k-event-tracker')?.close();
            // The run's event id is unique, so its resolved / suppressed entries are left as they
            // are; un-resolving an auto-resolved event by hand would only suppress it again.
            await ET.setResolved(eventId, false);
            for (const doc of probe?.docs ?? []) {
                // eslint-disable-next-line no-await-in-loop -- sequential teardown of the probe's own documents
                await doc.delete().catch(() => undefined);
            }
        } finally {
            if (probe !== undefined) {
                ET._graph = probe.graph;
                ET._characters = probe.characters;
            }
            await ET.loadGraph();
            g.__trackerAutoProbe = undefined;
        }
    }, EVENT_ID);
}

test.describe.serial('Event Tracker completion hooks, adventure graphs and portrait journals (Tier B, #591, #592, #590)', () => {
    test.setTimeout(scaledMs(300_000));
    test('an acquired item resolves its event, an adventure lists its graph, and a PC portrait opens its journal', async ({ page }) => {
        await joinOrSkip(page);
        const results = new Map<FlowName, string | null>();
        const pass = (flow: FlowName, ok: boolean, detail: string): void => {
            results.set(flow, ok ? null : detail);
        };
        const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as AdventureFixture;
        try {
            const seeded = await seed(page);
            if ('error' in seeded) throw new Error(seeded.error);

            // --- #591: acquiring the Bolas resolves the event -------------------
            const first = await acquireBolas(page, seeded.actorId);
            pass(
                'item-acquired-auto-resolves',
                first.resolved && first.origin === 'auto' && first.messages.length > 0,
                `resolved ${String(first.resolved)} after ${first.elapsedMs} ms, origin ${String(first.origin)}, messages ${first.messages.length}; ${
                    first.diagnosis
                }`,
            );
            const card = first.messages.at(-1);
            if (card !== undefined) await snap(page, 'event-auto-resolved-card', { selector: await popOutChatMessage(page, card) });

            // --- #591: the GM's undo holds against a second acquisition ---------
            const suppressed = await page.evaluate(async (eventId: string) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
                const g = globalThis as unknown as Globals;
                await g.game.wh40k.EventTracker.setResolved(eventId, false);
                return g.game.wh40k.EventTracker.getAutoSuppressed().includes(eventId);
            }, EVENT_ID);
            const second = await acquireBolas(page, seeded.actorId);
            pass(
                'gm-undo-persists',
                suppressed && !second.resolved && second.messages.length === 0,
                `suppressed ${String(suppressed)}, re-resolved ${String(second.resolved)}, messages ${second.messages.length}; ${second.diagnosis}`,
            );

            // --- #592: the adventure's journals bring its graph -----------------
            const adventure = await page.evaluate(async (journals: object[]) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
                const g = globalThis as unknown as Globals;
                const created = await g.JournalEntry.createDocuments(journals, { keepId: true });
                g.__trackerAutoProbe?.docs.push(...created);
                const ET = g.game.wh40k.EventTracker;
                await ET.loadGraph();
                ET.open();
                const { pollUntil, settle } = globalThis.wh40kE2E;
                await pollUntil(() => document.querySelector('#wh40k-event-tracker [data-wh40k-hook="evt-row"]') !== null);
                await settle(400);
                return {
                    sources: ET.sources.map((s) => s.label),
                    adventureEvents: Object.values(ET._graph ?? {}).filter((e: { graph?: string }) => typeof e.graph === 'string' && e.graph !== '').length,
                    rows: document.querySelectorAll('#wh40k-event-tracker [data-wh40k-hook="evt-row"]').length,
                };
            }, fixture.journal);
            pass(
                'adventure-graph-loads',
                adventure.sources.some((label) => label.startsWith('The Ashford Mill')) && adventure.adventureEvents > 0 && adventure.rows > 0,
                `sources ${JSON.stringify(adventure.sources)}, adventure events ${adventure.adventureEvents}, dashboard rows ${adventure.rows}`,
            );
            await snap(page, 'event-tracker-adventure-graph', { selector: DASHBOARD, closeWindows: true, keepWindow: 'wh40k-event-tracker' });

            // --- #590: the PC's portrait opens its journal ----------------------
            const sheetId = await page.evaluate(async (actorId: string) => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime globals are injected by the licensed app; no shipped types
                const g = globalThis as unknown as Globals;
                await g.foundry.applications.instances.get('wh40k-event-tracker')?.close();
                const sheet = g.game.actors.get(actorId)?.sheet;
                if (sheet === undefined) return null;
                await sheet.render({ force: true });
                await globalThis.wh40kE2E.waitFor(() => sheet.rendered, 'PC sheet', globalThis.wh40kE2E.scaledMs(10_000));
                return sheet.id;
            }, seeded.actorId);
            const icon = page.locator(`#${sheetId ?? 'missing'} [data-action="openPortraitJournal"]`).first();
            const hasIcon = sheetId !== null && (await icon.count()) > 0;
            if (hasIcon) {
                await snap(page, 'pc-portrait-journal-icon', { selector: `#${sheetId}`, closeWindows: true, keepWindow: sheetId });
                await icon.click();
            }
            const journalSheet = page.locator('[id*="JournalEntry-"]').filter({ hasText: 'Sworn to the Ordos' }).first();
            let opened = false;
            try {
                await journalSheet.waitFor({ timeout: scaledMs(10_000) });
                opened = true;
            } catch {
                opened = false;
            }
            pass('pc-portrait-journal-opens', hasIcon && opened, `portrait icon ${String(hasIcon)}, journal opened ${String(opened)}`);
            if (opened) await snap(page, 'pc-portrait-journal-opened', { selector: '[id*="JournalEntry-"]' });
        } finally {
            await teardown(page);
        }

        const failures: string[] = [];
        for (const flow of EVENT_TRACKER_AUTO_FLOWS) {
            const detail = results.get(flow);
            if (detail === null) recordCoverage('event-tracker-auto.flow', flow);
            else failures.push(`flow ${flow}: ${detail ?? 'flow did not run'}`);
        }
        expect(failures, failures.join('\n')).toEqual([]);
    });
});
