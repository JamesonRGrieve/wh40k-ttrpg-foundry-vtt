import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinOrSkip } from './lib/join';
import { expect, test } from './lib/test';
import { scaledMs } from './lib/timing';

/**
 * Tier B extra coverage of the three `src/module/managers/*` classes that
 * are NOT already exercised by `managers.spec.ts` (which covers
 * grants-manager). This spec drives the constructors,
 * public methods, pure helpers, and document-layer flows of:
 *
 *   - src/module/managers/event-tracker.ts
 *       (registerSettings / getResolved / setResolved / isAvailable /
 *        computeCharacterStates / open — exercised by directly seeding the
 *        `_graph` / `_characters` static fields and the persisted world
 *        setting, then asserting on derived state + the rendered dashboard).
 *   - src/module/managers/item-drop-manager.ts
 *       (dropItemFromActor no-token + non-droppable short-circuits, the
 *        full create-loot-pile path against a real Scene + Token, and
 *        pickupLoot stack-merge + pile deletion. The pure helpers
 *        (isDroppable / snapToGrid / findMergeablePileIndex /
 *        planStackMerge / resolveReceivingActor) already have unit coverage
 *        in item-drop-manager.test.ts — this spec drives the Foundry
 *        orchestration the unit tests cannot reach).
 *   - src/module/managers/inventory-generator-manager.ts
 *       (collectCandidates compendium scan scoped per game system,
 *        applyToActor create + stack-merge onto a real actor, and the
 *        `!actor.isOwner` permission-denied branch).
 *
 * Strategy mirrors weapon-attack.spec.ts / managers.spec.ts:
 *   - one shared cleanup registry, every actor / scene / item created here
 *     registered for end-of-probe deletion;
 *   - dialog-opening + document writes wrapped in the shared (scaled 5s) `withTimeout` so a
 *     blocking dialog or socket-wait can't hang the spec;
 *   - collect-failures-then-assert so one broken flow doesn't mask the rest.
 *
 * Keys MUST match the MANAGERS_EXTRA_FLOWS constant in
 * scripts/e2e-coverage.mjs (registered by the orchestrator).
 */

const MANAGERS_EXTRA_FLOWS = [
    'event-tracker-register-settings',
    'event-tracker-set-and-get-resolved',
    'event-tracker-is-available',
    'event-tracker-blocking-reasons',
    'event-tracker-compute-character-states',
    'event-tracker-build-content-html',
    'event-tracker-open-dialog',
    'event-tracker-macro-and-scene-control',
    'event-tracker-day-bar-and-resolve-toggle',
    'event-tracker-pc-attitude-edit',
    'event-tracker-journal-links',
    'event-tracker-scene-buttons',
    'item-drop-non-droppable-returns-null',
    'item-drop-no-token-returns-null',
    'item-drop-creates-loot-pile',
    'item-drop-pickup-loot',
    'inventory-generator-collect-candidates',
    'inventory-generator-apply-to-actor',
    'inventory-generator-permission-denied',
] as const;

type FlowName = (typeof MANAGERS_EXTRA_FLOWS)[number];

interface ProbeResult {
    flowsFired: Record<FlowName, boolean>;
    flowNotes: Partial<Record<FlowName, string>>;
    /**
     * Whether the PIXI canvas actually came up. Foundry's `RenderFlags#set`
     * ends with `canvas.pendingRenderFlags[priority].add(...)`, so ANY document
     * write against an actor that has a placed token throws
     * "Cannot read properties of undefined (reading 'OBJECTS')" on a client
     * whose canvas never initialised. The three token-touching flows below are
     * gated on this rather than reported as product failures.
     */
    canvasReady: boolean;
}

/** Minimal item-document shape consumed by the item-drop / inventory probes. */
interface XItem {
    id?: string;
    name?: string;
    delete?: () => Promise<void>;
}

/** Minimal actor-document shape consumed by the probes. */
interface XActor {
    id?: string;
    name?: string;
    isOwner?: boolean;
    type?: string;
    items?: { contents?: XItem[]; get?: (id: string) => XItem | undefined };
    prototypeToken?: { toObject?: () => XProtoToken };
    createEmbeddedDocuments?: (type: string, data: object[]) => Promise<XItem[]>;
    deleteEmbeddedDocuments?: (type: string, ids: string[]) => Promise<void>;
    delete?: () => Promise<void>;
    view?: () => void;
}

/** Loosely-typed prototype-token object built up before token creation. */
interface XProtoToken {
    name?: string;
    actorId?: string;
    x?: number;
    y?: number;
    delta?: { system?: object; items?: object[]; effects?: object[]; flags?: object };
}

interface XWindow {
    id?: string;
    title?: string;
    close?: () => Promise<void>;
}

/** EventTracker static surface the probes drive. */
interface EventTrackerLike {
    registerSettings: () => void;
    setResolved: (id: string, resolved: boolean) => Promise<void>;
    getResolved: () => Record<string, { resolvedAt?: string | number }> | null | undefined;
    isAvailable: (id: string) => boolean;
    computeCharacterStates: () => Record<
        string,
        { dispositions: Record<string, { attitude?: string; trigger?: string }>; relationships: Array<{ currentState?: string; trigger?: string }> }
    >;
    open: () => void;
    getCampaignDay: () => number;
    setCampaignDay: (day: number) => Promise<void>;
    getPcAttitudes: (npc: string) => Record<string, string>;
    setPcAttitude: (npc: string, pc: string, attitude: string) => Promise<void>;
    _graph?: Record<string, object> | null;
    _characters?: Record<string, object> | null;
}

/** The tracker change context every tracker hook passes last. */
interface TrackerChangeContext {
    origin?: string;
}

/** Minimal JournalEntry shape the journal-link probe creates, opens and deletes. */
interface XJournal {
    id?: string;
    uuid?: string;
    sheet?: { rendered?: boolean; close?: () => Promise<void> } | null;
    delete?: () => Promise<void>;
}

/** A scene-control tool as `getSceneControlButtons` registers it. */
interface XSceneControlTool {
    onChange?: (event?: Event, active?: boolean) => void;
    visible?: boolean;
}

/** The scene-control groups, keyed by group name. */
type XSceneControls = Record<string, { tools?: Record<string, XSceneControlTool> } | undefined>;

/** A world scene as the scene-button probe reads it. */
interface XScene {
    id?: string;
    name?: string;
    flags?: { 'wh40k-rpg'?: { vault?: { entityType?: string; name?: string } } };
    delete?: () => Promise<void>;
}

interface LootActor extends XActor {
    type?: string;
}

interface ItemDropManagerLike {
    dropItemFromActor?: (actor: object, item: object) => Promise<LootActor | null>;
    pickupLoot?: (receiver: object, pile: object) => Promise<boolean>;
}

interface InventoryCandidate {
    uuid?: string;
    name?: string;
    type?: string;
    profiles?: object;
}

interface InventoryGeneratorManagerLike {
    collectCandidates?: (gameSystem: string) => Promise<InventoryCandidate[]>;
    applyToActor?: (actor: object, uuids: string[]) => Promise<number | null>;
}

interface SceneLike {
    id?: string;
    delete?: () => Promise<void>;
    view?: () => void;
    createEmbeddedDocuments?: (type: string, data: object[]) => Promise<void>;
}

interface SceneCtor {
    create?: (data: object) => Promise<SceneLike | null>;
}

interface ActorCtorX {
    create?: (data: object) => Promise<XActor | null>;
}

/** Foundry runtime globals consumed by this spec's probe. */
interface XGlobal {
    Actor?: ActorCtorX;
    Scene?: SceneCtor;
    JournalEntry?: { create?: (data: object) => Promise<XJournal | null> };
    Hooks?: {
        on: (hook: string, fn: (...args: Array<string | number | boolean | TrackerChangeContext>) => void) => number;
        off: (hook: string, id: number) => void;
        callAll: (hook: string, ...args: object[]) => boolean;
    };
    game?: {
        wh40k?: { EventTracker?: EventTrackerLike };
        scenes?: { contents?: XScene[] };
        actors?: { get?: (id: string) => XActor | undefined };
        settings?: { get?: (namespace: string, key: string) => object | string | number | boolean | null | undefined };
        user?: { isGM?: boolean };
        /** Used to tell the Item Piles drop path from the loot-actor fallback (#385). */
        modules?: { get?: (id: string) => { active?: boolean } | undefined };
    };
    ui?: { windows?: Record<string, XWindow>; controls?: { controls?: XSceneControls } };
    canvas?: { ready?: boolean };
}

const EVENT_TRACKER_MODULE_URL = '/systems/wh40k-rpg/module/managers/event-tracker.js';
const ITEM_DROP_MODULE_URL = '/systems/wh40k-rpg/module/managers/item-drop-manager.js';
const INVENTORY_GENERATOR_MODULE_URL = '/systems/wh40k-rpg/module/managers/inventory-generator-manager.js';

async function probeManagersExtraFlows(page: Page): Promise<ProbeResult> {
    const result = await page.evaluate(
        async ({
            flows,
            eventTrackerUrl,
            itemDropUrl,
            inventoryGeneratorUrl,
        }: {
            flows: readonly string[];
            eventTrackerUrl: string;
            itemDropUrl: string;
            inventoryGeneratorUrl: string;
        }): Promise<{ flowsFired: Record<string, boolean>; flowNotes: Record<string, string>; canvasReady: boolean }> => {
            // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `globalThis` is untyped; narrowed to XGlobal
            const g = globalThis as unknown as XGlobal;
            const ActorGbl = g.Actor;
            const SceneGbl = g.Scene;
            const gameGbl = g.game;
            const uiGbl = g.ui;
            const JournalGbl = g.JournalEntry;
            const HooksGbl = g.Hooks;

            const fired: Record<string, boolean> = {};
            const notes: Record<string, string> = {};
            for (const f of flows) fired[f] = false;

            // Wrap any awaitable with a timeout so a blocking dialog or
            // socket-wait can't hang the spec (mirrors weapon-attack.spec.ts).
            const { withTimeout, pollUntil, settle } = globalThis.wh40kE2E;
            // Compendium-walking inventory-generator calls get longer budgets.
            const INVENTORY_APPLY_TIMEOUT_MS = globalThis.wh40kE2E.scaledMs(10_000);
            const COLLECT_CANDIDATES_TIMEOUT_MS = globalThis.wh40kE2E.scaledMs(15_000);

            /** The Event Tracker dashboard's ApplicationV2 id (its window element's DOM id). */
            const EVENT_TRACKER_APP_ID = 'wh40k-event-tracker';

            /** The open Event Tracker dashboard's window element, or null. */
            const trackerRoot = (): HTMLElement | null => document.getElementById(EVENT_TRACKER_APP_ID);

            /** Close the Event Tracker dashboard (an ApplicationV2, so not in ui.windows) via its header close control. */
            async function closeEventTracker(): Promise<void> {
                trackerRoot()?.querySelector<HTMLElement>('[data-action="close"]')?.click();
                await pollUntil(() => trackerRoot() == null);
            }

            /** Drain any dialog the previous probe left open. */
            async function closeOpenDialogs(): Promise<void> {
                const windows = Object.values(uiGbl?.windows ?? {});
                for (const w of windows) {
                    const id = `${w.id ?? ''} ${w.title ?? ''}`.toLowerCase();
                    if (id.includes('dialog') || id.includes('event tracker') || id.includes('tracker')) {
                        try {
                            await w.close?.();
                        } catch {
                            /* ignore */
                        }
                    }
                }
            }

            // Shared cleanup registry — every actor / scene / item we
            // create gets registered for end-of-probe deletion.
            const cleanups: Array<() => Promise<void>> = [];

            // Shared docs threaded across the item-drop / inventory flows.
            // Populated by probeSharedActors() and the loot-pile flow.
            let pc: XActor | null = null;
            const getPc = (): XActor | null => (pc?.id != null ? gameGbl?.actors?.get?.(pc.id) ?? null : null);
            // Mirrors `integrations/item-piles.ts` itemPilesApi()'s own gate.
            const itemPilesActive = (): boolean => gameGbl?.modules?.get?.('item-piles')?.active === true;
            /** Queue a created loot pile for teardown. No-op without an id. */
            const registerLootCleanup = (lootId: string | null | undefined): void => {
                if (lootId == null) return;
                cleanups.push(async () => {
                    try {
                        await gameGbl?.actors?.get?.(lootId)?.delete?.();
                    } catch {
                        /* ignore */
                    }
                });
            };
            let lootActor: LootActor | null = null;

            /* ============================================================
             * Flow 1: event-tracker-register-settings
             * EventTracker.registerSettings() registers the world
             * setting under the system namespace. Foundry throws if a
             * setting is registered twice, so the system's own init may
             * already have registered it — treat "already registered"
             * as success too. Assert the setting becomes gettable.
             * ============================================================ */
            async function probeRegisterSettings(): Promise<void> {
                try {
                    const mod = (await import(eventTrackerUrl)) as { EventTracker?: EventTrackerLike; default?: EventTrackerLike };
                    const ET = mod.EventTracker ?? mod.default;
                    if (ET == null) {
                        notes['event-tracker-register-settings'] = 'EventTracker.registerSettings unavailable';
                    } else {
                        let registered = false;
                        try {
                            ET.registerSettings();
                            registered = true;
                        } catch (err) {
                            // Duplicate-registration is expected if the
                            // system already registered it during init.
                            const msg = err instanceof Error ? err.message : String(err);
                            if (msg.toLowerCase().includes('already')) {
                                registered = true;
                            } else {
                                notes['event-tracker-register-settings'] = `registerSettings threw: ${msg}`;
                            }
                        }
                        if (registered) {
                            // Setting must now resolve (default {} per the schema).
                            const value = gameGbl?.settings?.get?.('wh40k-rpg', 'event-tracker-state');
                            if (value !== undefined && value !== null && typeof value === 'object') {
                                fired['event-tracker-register-settings'] = true;
                                notes['event-tracker-register-settings'] = 'world setting registered and resolves to an object';
                            } else {
                                notes['event-tracker-register-settings'] = `setting did not resolve (got ${String(value)})`;
                            }
                        }
                    }
                } catch (err) {
                    notes['event-tracker-register-settings'] = `flow threw: ${err instanceof Error ? err.message : String(err)}`;
                }
            }

            /* ============================================================
             * Flow 2: event-tracker-set-and-get-resolved
             * setResolved(id, true) persists into the world setting and
             * getResolved() reads it back; setResolved(id, false)
             * removes it. Exercises the world-setting round-trip and
             * the delete branch.
             * ============================================================ */
            async function probeSetGetResolved(): Promise<void> {
                try {
                    const mod = (await import(eventTrackerUrl)) as { EventTracker?: EventTrackerLike; default?: EventTrackerLike };
                    const ET = mod.EventTracker ?? mod.default;
                    if (ET == null) {
                        notes['event-tracker-set-and-get-resolved'] = 'setResolved/getResolved unavailable';
                    } else {
                        const eventId = 'probe-event-alpha';
                        await withTimeout(ET.setResolved(eventId, true), 'setResolved(true)');
                        const afterSet = ET.getResolved();
                        const present = afterSet != null && eventId in afterSet;
                        const stamped = present && typeof afterSet[eventId].resolvedAt === 'string';
                        await withTimeout(ET.setResolved(eventId, false), 'setResolved(false)');
                        const afterClear = ET.getResolved();
                        const removed = afterClear != null && typeof afterClear === 'object' && !(eventId in afterClear);
                        if (present && stamped && removed) {
                            fired['event-tracker-set-and-get-resolved'] = true;
                            notes['event-tracker-set-and-get-resolved'] = 'resolved state round-tripped through the world setting (set + clear)';
                        } else {
                            notes['event-tracker-set-and-get-resolved'] = `present=${present} stamped=${stamped} removed=${removed}`;
                        }
                    }
                } catch (err) {
                    notes['event-tracker-set-and-get-resolved'] = `flow threw: ${err instanceof Error ? err.message : String(err)}`;
                }
            }

            /* ============================================================
             * Flow 3: event-tracker-is-available
             * Seed the static `_graph` with a small dependency chain,
             * resolve the prerequisites in the world setting, and
             * assert isAvailable() flips from false → true. Covers the
             * unknown-event, requires, and requires_any branches.
             * ============================================================ */
            async function probeIsAvailable(): Promise<void> {
                try {
                    const mod = (await import(eventTrackerUrl)) as { EventTracker?: EventTrackerLike; default?: EventTrackerLike };
                    const ET = mod.EventTracker ?? mod.default;
                    if (ET == null) {
                        notes['event-tracker-is-available'] = 'EventTracker.isAvailable unavailable';
                    } else {
                        const prevGraph = ET._graph;
                        ET._graph = {
                            'evt-root': { id: 'evt-root', name: 'Root Event', location: 'Hive Sibellus' },
                            'evt-gate': {
                                id: 'evt-gate',
                                name: 'Gate Event',
                                requires: ['evt-root'],
                                requires_any: ['evt-side-a', 'evt-side-b'],
                            },
                            'evt-side-a': { id: 'evt-side-a', name: 'Side A' },
                            'evt-side-b': { id: 'evt-side-b', name: 'Side B' },
                        };
                        try {
                            const unknownEvent = ET.isAvailable('does-not-exist');
                            const rootAvailable = ET.isAvailable('evt-root'); // no prereqs → true
                            const gateBefore = ET.isAvailable('evt-gate'); // prereqs unmet → false
                            await withTimeout(ET.setResolved('evt-root', true), 'resolve evt-root');
                            const gateStillBlocked = ET.isAvailable('evt-gate'); // requires_any still unmet
                            await withTimeout(ET.setResolved('evt-side-b', true), 'resolve evt-side-b');
                            const gateAfter = ET.isAvailable('evt-gate'); // both met → true
                            if (!unknownEvent && rootAvailable && !gateBefore && !gateStillBlocked && gateAfter) {
                                fired['event-tracker-is-available'] = true;
                                notes['event-tracker-is-available'] = 'isAvailable resolves unknown/root/requires/requires_any branches correctly';
                            } else {
                                notes[
                                    'event-tracker-is-available'
                                ] = `unknown=${unknownEvent} root=${rootAvailable} gateBefore=${gateBefore} stillBlocked=${gateStillBlocked} after=${gateAfter}`;
                            }
                        } finally {
                            // Restore graph + clear our resolved markers.
                            try {
                                await ET.setResolved('evt-root', false);
                                await ET.setResolved('evt-side-b', false);
                            } catch {
                                /* best-effort */
                            }
                            ET._graph = prevGraph;
                        }
                    }
                } catch (err) {
                    notes['event-tracker-is-available'] = `flow threw: ${err instanceof Error ? err.message : String(err)}`;
                }
            }

            /* ============================================================
             * Flow 4: event-tracker-blocking-reasons
             * The requirement shapes `export_events.py` actually writes — a
             * bare-string `requires` and a nested {all/any} tree — gate
             * isAvailable() until the blocking events resolve.
             * ============================================================ */
            async function probeBlockingReasons(): Promise<void> {
                try {
                    const mod = (await import(eventTrackerUrl)) as { EventTracker?: EventTrackerLike; default?: EventTrackerLike };
                    const ET = mod.EventTracker ?? mod.default;
                    if (ET == null) {
                        notes['event-tracker-blocking-reasons'] = 'EventTracker.isAvailable unavailable';
                    } else {
                        const prevGraph = ET._graph;
                        ET._graph = {
                            'evt-root': { id: 'evt-root', name: 'Root Event', location: '[[Hive Sibellus]]' },
                            'evt-next': { id: 'evt-next', name: 'Next Event', requires: 'evt-root' },
                            'evt-tree': { id: 'evt-tree', name: 'Tree Event', requires: { all: ['evt-root', { any: ['evt-side-a', 'evt-side-b'] }] } },
                            'evt-side-a': { id: 'evt-side-a', name: 'Side A' },
                            'evt-side-b': { id: 'evt-side-b', name: 'Side B' },
                        };
                        try {
                            const nextBefore = ET.isAvailable('evt-next');
                            const treeBefore = ET.isAvailable('evt-tree');
                            await withTimeout(ET.setResolved('evt-root', true), 'resolve evt-root');
                            const nextAfter = ET.isAvailable('evt-next');
                            const treeHalf = ET.isAvailable('evt-tree');
                            await withTimeout(ET.setResolved('evt-side-a', true), 'resolve evt-side-a');
                            const treeAfter = ET.isAvailable('evt-tree');
                            if (!nextBefore && !treeBefore && nextAfter && !treeHalf && treeAfter) {
                                fired['event-tracker-blocking-reasons'] = true;
                                notes['event-tracker-blocking-reasons'] = 'bare-string and nested all/any requirements block until resolved';
                            } else {
                                notes[
                                    'event-tracker-blocking-reasons'
                                ] = `nextBefore=${nextBefore} treeBefore=${treeBefore} nextAfter=${nextAfter} treeHalf=${treeHalf} treeAfter=${treeAfter}`;
                            }
                        } finally {
                            try {
                                await ET.setResolved('evt-root', false);
                                await ET.setResolved('evt-side-a', false);
                            } catch {
                                /* best-effort */
                            }
                            ET._graph = prevGraph;
                        }
                    }
                } catch (err) {
                    notes['event-tracker-blocking-reasons'] = `flow threw: ${err instanceof Error ? err.message : String(err)}`;
                }
            }

            /* ============================================================
             * Flow 5: event-tracker-compute-character-states
             * Seed `_characters` with a disposition that triggers on a
             * resolved event plus a relationship whose influences[]
             * walk to a new state. Resolve the trigger events and
             * assert computeCharacterStates() reflects the triggered
             * disposition + walked relationship state.
             * ============================================================ */
            async function probeComputeStates(): Promise<void> {
                try {
                    const mod = (await import(eventTrackerUrl)) as { EventTracker?: EventTrackerLike; default?: EventTrackerLike };
                    const ET = mod.EventTracker ?? mod.default;
                    if (ET == null) {
                        notes['event-tracker-compute-character-states'] = 'computeCharacterStates unavailable';
                    } else {
                        const prevGraph = ET._graph;
                        const prevChars = ET._characters;
                        ET._graph = {
                            'evt-betrayal': { id: 'evt-betrayal', name: 'The Betrayal' },
                            'evt-pact': { id: 'evt-pact', name: 'The Pact' },
                        };
                        ET._characters = {
                            'Inquisitor Vael': {
                                dispositions: [
                                    { target: 'party', attitude: 'neutral', default: true },
                                    { target: 'party', attitude: 'hostile', trigger: 'evt-betrayal' },
                                ],
                                relationships: [
                                    {
                                        target: 'The Acolytes',
                                        type: 'patron',
                                        state: 'wary',
                                        influences: [{ event: 'evt-pact', to: 'ally', note: 'sealed in blood' }],
                                    },
                                ],
                            },
                        };
                        try {
                            await withTimeout(ET.setResolved('evt-betrayal', true), 'resolve evt-betrayal');
                            await withTimeout(ET.setResolved('evt-pact', true), 'resolve evt-pact');
                            const states = ET.computeCharacterStates();
                            const vael = states['Inquisitor Vael'];
                            const dispOk = vael.dispositions['party'].attitude === 'hostile' && vael.dispositions['party'].trigger === 'evt-betrayal';
                            const relOk =
                                Array.isArray(vael.relationships) &&
                                vael.relationships.length === 1 &&
                                vael.relationships[0]?.currentState === 'ally' &&
                                vael.relationships[0]?.trigger === 'evt-pact';
                            if (dispOk && relOk) {
                                fired['event-tracker-compute-character-states'] = true;
                                notes['event-tracker-compute-character-states'] = 'triggered disposition + walked relationship influences resolved correctly';
                            } else {
                                notes['event-tracker-compute-character-states'] = `dispOk=${dispOk} relOk=${relOk} states=${JSON.stringify(states)}`;
                            }
                        } finally {
                            try {
                                await ET.setResolved('evt-betrayal', false);
                                await ET.setResolved('evt-pact', false);
                            } catch {
                                /* best-effort */
                            }
                            ET._graph = prevGraph;
                            ET._characters = prevChars;
                        }
                    }
                } catch (err) {
                    notes['event-tracker-compute-character-states'] = `flow threw: ${err instanceof Error ? err.message : String(err)}`;
                }
            }

            /* ============================================================
             * Flow 6: event-tracker-build-content-html
             * With a graph + characters seeded, open() renders the GM
             * dashboard: timeline rows, the requirement tree of a locked
             * event, three tabs, and — after switching to Relations — the
             * NPC card with its computed disposition.
             * ============================================================ */
            async function probeBuildContentHtml(): Promise<void> {
                try {
                    const mod = (await import(eventTrackerUrl)) as { EventTracker?: EventTrackerLike; default?: EventTrackerLike };
                    const ET = mod.EventTracker ?? mod.default;
                    if (ET == null) {
                        notes['event-tracker-build-content-html'] = 'EventTracker.open unavailable';
                    } else if (gameGbl?.user?.isGM !== true) {
                        notes['event-tracker-build-content-html'] = 'not joined as GM — the dashboard is GM-only';
                    } else {
                        const prevGraph = ET._graph;
                        const prevChars = ET._characters;
                        ET._graph = {
                            'evt-arrival': {
                                id: 'evt-arrival',
                                name: 'Arrival at the Spire',
                                location: 'Spire',
                                source_name: 'Act I',
                            },
                            'evt-locked': {
                                id: 'evt-locked',
                                name: 'Sealed Vault',
                                requires: ['evt-arrival'],
                                excuse: 'The vault is sealed',
                                source_name: 'Act I',
                            },
                        };
                        ET._characters = {
                            'Magos Holt': {
                                dispositions: [{ target: 'party', attitude: 'ally', default: true }],
                                relationships: [],
                            },
                        };
                        try {
                            ET.open();
                            const root = (): HTMLElement | null => document.getElementById(EVENT_TRACKER_APP_ID);
                            await pollUntil(() => root()?.querySelector('[data-event-id="evt-locked"] [data-wh40k-hook="evt-requirement"]') != null);
                            const hasEvent = root()?.querySelector('[data-event-id="evt-arrival"]')?.textContent.includes('Arrival at the Spire') === true;
                            const hasLockedReason =
                                root()
                                    ?.querySelector('[data-event-id="evt-locked"] [data-wh40k-hook="evt-requirement"]')
                                    ?.textContent.includes('Arrival at the Spire') === true;
                            const hasTabs = root()?.querySelectorAll('[data-action="selectTab"]').length === 3;
                            root()?.querySelector<HTMLElement>('[data-action="selectTab"][data-tab="relations"]')?.click();
                            await pollUntil(() => root()?.querySelector('[data-wh40k-hook="evt-npc-card"][data-npc="Magos Holt"]') != null);
                            const npcAttitude = root()
                                ?.querySelector('[data-wh40k-hook="evt-npc-card"][data-npc="Magos Holt"] [data-wh40k-hook="evt-npc-attitude"]')
                                ?.textContent.trim();
                            if (hasEvent && hasLockedReason && hasTabs && npcAttitude === 'ally') {
                                fired['event-tracker-build-content-html'] = true;
                                notes['event-tracker-build-content-html'] =
                                    'dashboard rendered timeline rows, a requirement tree, three tabs and the Relations NPC card';
                            } else {
                                notes[
                                    'event-tracker-build-content-html'
                                ] = `hasEvent=${hasEvent} hasLockedReason=${hasLockedReason} hasTabs=${hasTabs} npcAttitude=${String(npcAttitude)}`;
                            }
                        } finally {
                            await closeEventTracker();
                            ET._graph = prevGraph;
                            ET._characters = prevChars;
                        }
                    }
                } catch (err) {
                    notes['event-tracker-build-content-html'] = `flow threw: ${err instanceof Error ? err.message : String(err)}`;
                }
            }

            /* ============================================================
             * Flow 7: event-tracker-open-dialog
             * open() is GM-only and short-circuits if `_graph` is null.
             * With a seeded graph and the GM user joined, it constructs
             * + renders a Dialog. Success: a window with the tracker
             * title appears (or the dialog instance reports a rendered
             * element). Close it after to keep the spec unblocked.
             * ============================================================ */
            async function probeOpenDialog(): Promise<void> {
                try {
                    const mod = (await import(eventTrackerUrl)) as { EventTracker?: EventTrackerLike; default?: EventTrackerLike };
                    const ET = mod.EventTracker ?? mod.default;
                    if (ET == null) {
                        notes['event-tracker-open-dialog'] = 'EventTracker.open unavailable';
                    } else if (gameGbl?.user?.isGM !== true) {
                        notes['event-tracker-open-dialog'] = 'not joined as GM — open() would short-circuit';
                    } else {
                        const prevGraph = ET._graph;
                        ET._graph = {
                            'evt-open-probe': { id: 'evt-open-probe', name: 'Open Probe Event', source_name: 'Probe Act' },
                        };
                        try {
                            const trackerOpened = (): boolean => document.getElementById(EVENT_TRACKER_APP_ID) != null;
                            ET.open();
                            // open() loads the dashboard module and renders the
                            // ApplicationV2; wait for its element to mount.
                            await pollUntil(trackerOpened);
                            if (trackerOpened()) {
                                fired['event-tracker-open-dialog'] = true;
                                notes['event-tracker-open-dialog'] = 'tracker dashboard rendered';
                            } else {
                                notes['event-tracker-open-dialog'] = 'open() did not produce a tracker window';
                            }
                        } finally {
                            await closeEventTracker();
                            ET._graph = prevGraph;
                        }
                    }
                } catch (err) {
                    notes['event-tracker-open-dialog'] = `flow threw: ${err instanceof Error ? err.message : String(err)}`;
                }
            }

            /* ============================================================
             * Shared plumbing for the dashboard-interaction flows (#589).
             * ============================================================ */

            /** The tracker module's class, or null when the module failed to load. */
            async function importTracker(): Promise<EventTrackerLike | null> {
                const mod = (await import(eventTrackerUrl)) as { EventTracker?: EventTrackerLike; default?: EventTrackerLike };
                return mod.EventTracker ?? mod.default ?? null;
            }

            /** Put back the graph and characters a flow seeded over (synchronous, so no await can interleave). */
            function restoreTracker(ET: EventTrackerLike, graph: EventTrackerLike['_graph'], characters: EventTrackerLike['_characters']): void {
                ET._graph = graph;
                ET._characters = characters;
            }

            /** Record every call of a hook until `off()`; each entry is the hook's argument list. */
            function recordHook(hook: string): { calls: Array<Array<string | number | boolean | TrackerChangeContext>>; off: () => void } {
                const calls: Array<Array<string | number | boolean | TrackerChangeContext>> = [];
                const id = HooksGbl?.on(hook, (...args) => {
                    calls.push(args);
                });
                return {
                    calls,
                    off: () => {
                        if (id !== undefined) HooksGbl?.off(hook, id);
                    },
                };
            }

            /** True when a recorded hook call carries the `manual` origin context last (a dashboard edit). */
            const isManualCall = (args: ReadonlyArray<string | number | boolean | TrackerChangeContext>): boolean => {
                const context = args[args.length - 1];
                return typeof context === 'object' && context.origin === 'manual';
            };

            /** Click a dashboard tab and wait for it to become the active one. */
            async function selectTrackerTab(tab: string): Promise<boolean> {
                trackerRoot()?.querySelector<HTMLElement>(`[data-action="selectTab"][data-tab="${tab}"]`)?.click();
                return pollUntil(() => trackerRoot()?.querySelector(`[data-action="selectTab"][data-tab="${tab}"][aria-selected="true"]`) != null);
            }

            /** Create a world JournalEntry, queued for teardown. */
            async function createProbeJournal(name: string, vault?: { path: string; entityType: string; name: string }): Promise<XJournal | null> {
                const journal = JournalGbl?.create
                    ? await withTimeout(
                          JournalGbl.create({ name, ...(vault === undefined ? {} : { flags: { 'wh40k-rpg': { vault } } }) }),
                          `JournalEntry.create ${name}`,
                      )
                    : null;
                if (journal != null) {
                    cleanups.push(async () => {
                        try {
                            await journal.sheet?.close?.();
                            await journal.delete?.();
                        } catch {
                            /* ignore */
                        }
                    });
                }
                return journal;
            }

            /** Create a world player-character actor, queued for teardown. */
            async function createProbePc(name: string): Promise<XActor | null> {
                const actor = ActorGbl?.create
                    ? await withTimeout(ActorGbl.create({ name, type: 'dh2-character', system: { gameSystem: 'dh2' } }), `Actor.create ${name}`)
                    : null;
                const actorId = actor?.id;
                if (actorId != null) {
                    cleanups.push(async () => {
                        try {
                            await gameGbl?.actors?.get?.(actorId)?.delete?.();
                        } catch {
                            /* ignore */
                        }
                    });
                }
                return actor;
            }

            /** The dashboard's journal content link carrying `uuid`, or null. */
            const trackerJournalLink = (uuid: string | undefined): HTMLElement | null =>
                uuid === undefined
                    ? null
                    : Array.from(trackerRoot()?.querySelectorAll<HTMLElement>('a.content-link[data-wh40k-hook="evt-journal-link"]') ?? []).find(
                          (link) => link.dataset['uuid'] === uuid,
                      ) ?? null;

            /** Click a journal link on the dashboard and wait for its journal's sheet to render, then close it. */
            async function clickOpensJournal(journal: XJournal | null): Promise<boolean> {
                const link = trackerJournalLink(journal?.uuid);
                if (journal == null || link === null) return false;
                link.click();
                const opened = await pollUntil(() => journal.sheet?.rendered === true);
                await journal.sheet?.close?.();
                return opened;
            }

            /* ============================================================
             * Flow 7b: event-tracker-macro-and-scene-control
             * The two documented entry points open the dashboard: the
             * `game.wh40k.EventTracker.open()` macro surface (the same
             * class the module exports) and the GM's WH40K scene-control
             * tool. The tool is read from the rendered scene controls, or —
             * when the controls have not rendered (no canvas) — from a
             * fresh `getSceneControlButtons` pass.
             * ============================================================ */
            async function probeMacroAndSceneControl(): Promise<void> {
                const flow = 'event-tracker-macro-and-scene-control';
                try {
                    const ET = await importTracker();
                    if (ET === null) {
                        notes[flow] = 'EventTracker unavailable';
                        return;
                    }
                    if (gameGbl?.user?.isGM !== true) {
                        notes[flow] = 'not joined as GM — the dashboard is GM-only';
                        return;
                    }
                    const macroSurface = gameGbl.wh40k?.EventTracker;
                    const sameClass = macroSurface === ET;
                    const sceneTool = (): XSceneControlTool | undefined => {
                        const rendered = uiGbl?.controls?.controls?.['wh40k']?.tools?.['eventTracker'];
                        if (rendered !== undefined) return rendered;
                        const controls: XSceneControls = {};
                        HooksGbl?.callAll('getSceneControlButtons', controls);
                        return controls['wh40k']?.tools?.['eventTracker'];
                    };
                    const prevGraph = ET._graph;
                    const prevChars = ET._characters;
                    ET._graph = { 'evt-macro-probe': { id: 'evt-macro-probe', name: 'Macro Probe Event', source_name: 'Probe Act' } };
                    try {
                        macroSurface?.open();
                        const openedByMacro = await pollUntil(() => trackerRoot() != null);
                        await closeEventTracker();
                        const tool = sceneTool();
                        tool?.onChange?.(new Event('click'), true);
                        const openedByControl = await pollUntil(() => trackerRoot() != null);
                        if (sameClass && openedByMacro && tool?.visible === true && openedByControl) {
                            fired[flow] = true;
                            notes[flow] = 'game.wh40k.EventTracker.open() and the GM scene-control tool both open the dashboard';
                        } else {
                            notes[flow] = `sameClass=${sameClass} openedByMacro=${openedByMacro} toolVisible=${String(
                                tool?.visible,
                            )} openedByControl=${openedByControl}`;
                        }
                    } finally {
                        await closeEventTracker();
                        restoreTracker(ET, prevGraph, prevChars);
                    }
                } catch (err) {
                    notes[flow] = `flow threw: ${err instanceof Error ? err.message : String(err)}`;
                }
            }

            /* ============================================================
             * Flow 7c: event-tracker-day-bar-and-resolve-toggle
             * The day bar's next / previous buttons step the persisted
             * campaign day (and the label) and fire campaignDayChanged
             * with the manual origin; ticking an event's checkbox
             * resolves it and fires eventResolved. Restores the day and
             * the resolved state after.
             * ============================================================ */
            async function probeDayBarAndResolveToggle(): Promise<void> {
                const flow = 'event-tracker-day-bar-and-resolve-toggle';
                try {
                    const ET = await importTracker();
                    if (ET === null) {
                        notes[flow] = 'EventTracker unavailable';
                        return;
                    }
                    if (gameGbl?.user?.isGM !== true) {
                        notes[flow] = 'not joined as GM — the dashboard is GM-only';
                        return;
                    }
                    const eventId = 'evt-day-probe';
                    const startDay = ET.getCampaignDay();
                    const prevGraph = ET._graph;
                    const prevChars = ET._characters;
                    ET._graph = { [eventId]: { id: eventId, name: 'Day Probe Event', source_name: 'Day Probe Source' } };
                    const dayHook = recordHook('wh40k-rpg.campaignDayChanged');
                    const resolvedHook = recordHook('wh40k-rpg.eventResolved');
                    const dayLabel = (): string => trackerRoot()?.querySelector('[data-wh40k-hook="evt-day-label"]')?.textContent.trim() ?? '';
                    const stepDay = (delta: number): void => {
                        trackerRoot()?.querySelector<HTMLElement>(`[data-action="stepDay"][data-delta="${delta}"]`)?.click();
                    };
                    try {
                        ET.open();
                        await pollUntil(() => trackerRoot()?.querySelector(`[data-wh40k-hook="evt-row"][data-event-id="${eventId}"]`) != null);
                        const labelBefore = dayLabel();
                        stepDay(1);
                        const steppedForward = await pollUntil(() => ET.getCampaignDay() === startDay + 1);
                        const labelMoved = await pollUntil(() => dayLabel() !== '' && dayLabel() !== labelBefore);
                        stepDay(-1);
                        const steppedBack = await pollUntil(() => ET.getCampaignDay() === startDay);
                        const dayHooked = dayHook.calls.some((args) => args[0] === startDay + 1 && isManualCall(args));

                        trackerRoot()?.querySelector<HTMLInputElement>(`[data-action="toggleResolved"][data-event-id="${eventId}"]`)?.click();
                        const resolved = await pollUntil(() => eventId in (ET.getResolved() ?? {}));
                        const resolvedHooked = resolvedHook.calls.some((args) => args[0] === eventId && args[1] === true && isManualCall(args));
                        if (steppedForward && labelMoved && steppedBack && dayHooked && resolved && resolvedHooked) {
                            fired[flow] = true;
                            notes[flow] = 'day bar stepped the persisted day both ways and the checkbox resolved the event, each firing its hook';
                        } else {
                            notes[
                                flow
                            ] = `forward=${steppedForward} label=${labelMoved} back=${steppedBack} dayHook=${dayHooked} resolved=${resolved} resolvedHook=${resolvedHooked}`;
                        }
                    } finally {
                        dayHook.off();
                        resolvedHook.off();
                        restoreTracker(ET, prevGraph, prevChars);
                        await closeEventTracker();
                        try {
                            await ET.setResolved(eventId, false);
                            await ET.setCampaignDay(startDay);
                        } catch {
                            /* best-effort */
                        }
                    }
                } catch (err) {
                    notes[flow] = `flow threw: ${err instanceof Error ? err.message : String(err)}`;
                }
            }

            /* ============================================================
             * Flow 7d: event-tracker-pc-attitude-edit
             * On the Relations tab, editing a PC's attitude toward an NPC
             * persists it to the world setting and fires
             * pcAttitudeChanged. The PC row comes from a real world
             * player-character actor.
             * ============================================================ */
            async function probePcAttitudeEdit(): Promise<void> {
                const flow = 'event-tracker-pc-attitude-edit';
                try {
                    const ET = await importTracker();
                    if (ET === null) {
                        notes[flow] = 'EventTracker unavailable';
                        return;
                    }
                    if (gameGbl?.user?.isGM !== true) {
                        notes[flow] = 'not joined as GM — the dashboard is GM-only';
                        return;
                    }
                    const npc = 'Attitude Probe Magos';
                    const pcName = 'managers-extra-attitude-pc';
                    const pcActor = await createProbePc(pcName);
                    if (pcActor == null) {
                        notes[flow] = 'PC actor could not be created';
                        return;
                    }
                    const prevGraph = ET._graph;
                    const prevChars = ET._characters;
                    ET._graph = { 'evt-attitude-probe': { id: 'evt-attitude-probe', name: 'Attitude Probe Event', source_name: 'Probe Act' } };
                    ET._characters = { [npc]: { dispositions: [{ target: 'party', attitude: 'neutral', default: true }], relationships: [] } };
                    const attitudeHook = recordHook('wh40k-rpg.pcAttitudeChanged');
                    const attitudeInput = (): HTMLInputElement | null =>
                        Array.from(trackerRoot()?.querySelectorAll<HTMLInputElement>('[data-wh40k-hook="evt-pc-attitude"]') ?? []).find(
                            (input) => input.dataset['npc'] === npc && input.dataset['pc'] === pcName,
                        ) ?? null;
                    try {
                        ET.open();
                        await pollUntil(() => trackerRoot() != null);
                        const onRelations = await selectTrackerTab('relations');
                        await pollUntil(() => attitudeInput() != null);
                        const input = attitudeInput();
                        if (input !== null) {
                            input.value = 'wary';
                            input.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                        const persisted = await pollUntil(() => ET.getPcAttitudes(npc)[pcName] === 'wary');
                        const hooked = attitudeHook.calls.some((args) => args[0] === npc && args[1] === pcName && args[2] === 'wary' && isManualCall(args));
                        if (onRelations && input !== null && persisted && hooked) {
                            fired[flow] = true;
                            notes[flow] = "editing a PC's attitude on the Relations tab persisted it and fired pcAttitudeChanged";
                        } else {
                            notes[flow] = `relations=${onRelations} input=${input !== null} persisted=${persisted} hooked=${hooked}`;
                        }
                    } finally {
                        attitudeHook.off();
                        restoreTracker(ET, prevGraph, prevChars);
                        await closeEventTracker();
                        try {
                            await ET.setPcAttitude(npc, pcName, '');
                        } catch {
                            /* best-effort */
                        }
                    }
                } catch (err) {
                    notes[flow] = `flow threw: ${err instanceof Error ? err.message : String(err)}`;
                }
            }

            /* ============================================================
             * Flow 7e: event-tracker-journal-links
             * Each tracker reference renders as a native content link to
             * its world JournalEntry, and clicking it opens that journal:
             * the event source (Timeline, by exact name), the location
             * (Location tab, by its vault identity flag though the journal
             * was renamed), the NPC and a PC (Relations tab, by name).
             * ============================================================ */
            async function probeJournalLinks(): Promise<void> {
                const flow = 'event-tracker-journal-links';
                try {
                    const ET = await importTracker();
                    if (ET === null) {
                        notes[flow] = 'EventTracker unavailable';
                        return;
                    }
                    if (gameGbl?.user?.isGM !== true) {
                        notes[flow] = 'not joined as GM — the dashboard is GM-only';
                        return;
                    }
                    const source = 'Journal Probe Day';
                    const location = 'Journal Probe Spire';
                    const npc = 'Journal Probe Holt';
                    const pcName = 'managers-extra-journal-pc';
                    const sourceJournal = await createProbeJournal(source);
                    const locationJournal = await createProbeJournal('Journal Probe Spire (renamed by the GM)', {
                        path: `Locations/${location}.md`,
                        entityType: 'location',
                        name: location,
                    });
                    const npcJournal = await createProbeJournal(npc);
                    const pcJournal = await createProbeJournal(pcName);
                    const pcActor = await createProbePc(pcName);
                    if (sourceJournal == null || locationJournal == null || npcJournal == null || pcJournal == null || pcActor == null) {
                        notes[flow] = 'probe journals / PC actor could not be created';
                        return;
                    }
                    const prevGraph = ET._graph;
                    const prevChars = ET._characters;
                    ET._graph = { 'evt-journal-probe': { id: 'evt-journal-probe', name: 'Journal Probe Event', location, source_name: source } };
                    ET._characters = { [npc]: { dispositions: [{ target: 'party', attitude: 'neutral', default: true }], relationships: [] } };
                    try {
                        ET.open();
                        await pollUntil(() => trackerJournalLink(sourceJournal.uuid) != null);
                        const sourceOpens = await clickOpensJournal(sourceJournal);
                        await selectTrackerTab('location');
                        await pollUntil(() => trackerJournalLink(locationJournal.uuid) != null);
                        const locationOpens = await clickOpensJournal(locationJournal);
                        await selectTrackerTab('relations');
                        await pollUntil(() => trackerJournalLink(npcJournal.uuid) != null && trackerJournalLink(pcJournal.uuid) != null);
                        const npcOpens = await clickOpensJournal(npcJournal);
                        const pcOpens = await clickOpensJournal(pcJournal);
                        if (sourceOpens && locationOpens && npcOpens && pcOpens) {
                            fired[flow] = true;
                            notes[flow] = 'event source, location (by vault flag), NPC and PC links each opened their journal entry';
                        } else {
                            notes[flow] = `source=${sourceOpens} location=${locationOpens} npc=${npcOpens} pc=${pcOpens}`;
                        }
                    } finally {
                        await closeEventTracker();
                        restoreTracker(ET, prevGraph, prevChars);
                    }
                } catch (err) {
                    notes[flow] = `flow threw: ${err instanceof Error ? err.message : String(err)}`;
                }
            }

            /* ============================================================
             * Flow 7f: event-tracker-scene-buttons
             * A location with no scene offers Spawn Scene; clicking it
             * creates the scene, stamped with the location journal's vault
             * identity, and the group then offers Go to Scene instead.
             * (Go to Scene itself views the scene on the canvas, so it is
             * not clicked here.)
             * ============================================================ */
            async function probeSceneButtons(): Promise<void> {
                const flow = 'event-tracker-scene-buttons';
                try {
                    const ET = await importTracker();
                    if (ET === null) {
                        notes[flow] = 'EventTracker unavailable';
                        return;
                    }
                    if (gameGbl?.user?.isGM !== true) {
                        notes[flow] = 'not joined as GM — the dashboard is GM-only';
                        return;
                    }
                    const location = 'Scene Probe Hab Block';
                    const journal = await createProbeJournal('Scene Probe Hab Block (journal)', {
                        path: `Locations/${location}.md`,
                        entityType: 'location',
                        name: location,
                    });
                    if (journal == null) {
                        notes[flow] = 'location journal could not be created';
                        return;
                    }
                    const spawnedScene = (): XScene | undefined => gameGbl.scenes?.contents?.find((scene) => scene.name === location);
                    const sceneButton = (action: string): HTMLElement | null =>
                        Array.from(trackerRoot()?.querySelectorAll<HTMLElement>(`[data-action="${action}"]`) ?? []).find(
                            (button) => button.dataset['location'] === location,
                        ) ?? null;
                    const prevGraph = ET._graph;
                    const prevChars = ET._characters;
                    ET._graph = { 'evt-scene-probe': { id: 'evt-scene-probe', name: 'Scene Probe Event', location, source_name: 'Probe Act' } };
                    try {
                        ET.open();
                        await pollUntil(() => trackerRoot() != null);
                        await selectTrackerTab('location');
                        const offeredSpawn = await pollUntil(() => sceneButton('spawnScene') != null);
                        sceneButton('spawnScene')?.click();
                        const created = await pollUntil(() => spawnedScene() !== undefined);
                        const sceneId = spawnedScene()?.id;
                        if (sceneId != null) {
                            cleanups.push(async () => {
                                try {
                                    await gameGbl.scenes?.contents?.find((scene) => scene.id === sceneId)?.delete?.();
                                } catch {
                                    /* ignore */
                                }
                            });
                        }
                        const vault = spawnedScene()?.flags?.['wh40k-rpg']?.vault;
                        const stamped = vault?.entityType === 'location' && vault.name === location;
                        const offeredGo = await pollUntil(() => sceneButton('viewScene') != null && sceneButton('spawnScene') == null);
                        if (offeredSpawn && created && stamped && offeredGo) {
                            fired[flow] = true;
                            notes[flow] = 'Spawn Scene created a vault-stamped scene and the group switched to Go to Scene';
                        } else {
                            notes[flow] = `spawnOffered=${offeredSpawn} created=${created} stamped=${stamped} goOffered=${offeredGo}`;
                        }
                    } finally {
                        await closeEventTracker();
                        restoreTracker(ET, prevGraph, prevChars);
                    }
                } catch (err) {
                    notes[flow] = `flow threw: ${err instanceof Error ? err.message : String(err)}`;
                }
            }

            // ---- shared actors for the item-drop / inventory flows ----
            async function probeSharedActors(): Promise<void> {
                try {
                    pc = ActorGbl?.create
                        ? await withTimeout(
                              ActorGbl.create({
                                  name: 'managers-extra-pc',
                                  type: 'dh2-character',
                                  system: { gameSystem: 'dh2' },
                              }),
                              'PC Actor.create',
                          )
                        : null;
                    const pcId = pc?.id;
                    if (pcId != null) {
                        cleanups.push(async () => {
                            try {
                                await gameGbl?.actors?.get?.(pcId)?.delete?.();
                            } catch {
                                /* ignore */
                            }
                        });
                    }
                } catch (err) {
                    notes['item-drop-non-droppable-returns-null'] = `PC create threw: ${err instanceof Error ? err.message : String(err)}`;
                }

                // Yield a tick so the server-side create flushes before the
                // first createEmbeddedDocuments fires (V14 race guard,
                // mirrors weapon-attack.spec.ts).
                await settle(250);
            }

            /* ============================================================
             * Flow 8: item-drop-non-droppable-returns-null
             * dropItemFromActor with an ownership-fact item (talent)
             * must short-circuit via isDroppable() and return null
             * without creating a loot pile.
             * ============================================================ */
            async function probeDropNonDroppable(): Promise<void> {
                try {
                    const live = getPc();
                    if (live == null) {
                        notes['item-drop-non-droppable-returns-null'] = 'PC actor unavailable';
                    } else {
                        const mod = (await import(itemDropUrl)) as { ItemDropManager?: ItemDropManagerLike; default?: ItemDropManagerLike };
                        const IDM = mod.ItemDropManager ?? mod.default;
                        const created = await withTimeout(
                            live.createEmbeddedDocuments?.('Item', [{ name: 'probe-nondrop-talent', type: 'talent' }]) ?? Promise.resolve(undefined),
                            'create talent',
                        );
                        const createdId = created?.at(0)?.id ?? '';
                        const talent = createdId !== '' ? live.items?.get?.(createdId) : undefined;
                        if (talent == null || typeof IDM?.dropItemFromActor !== 'function') {
                            notes['item-drop-non-droppable-returns-null'] = 'talent create failed';
                        } else {
                            cleanups.push(async () => {
                                try {
                                    await talent.delete?.();
                                } catch {
                                    /* ignore */
                                }
                            });
                            const dropResult1 = await withTimeout(IDM.dropItemFromActor(live, talent), 'dropItemFromActor(talent)');
                            const stillOwned = live.items?.get?.(talent.id ?? '') !== undefined;
                            if (dropResult1 === null && stillOwned) {
                                fired['item-drop-non-droppable-returns-null'] = true;
                                notes['item-drop-non-droppable-returns-null'] = 'non-droppable talent short-circuited (null, item retained)';
                            } else {
                                notes['item-drop-non-droppable-returns-null'] = `result=${
                                    dropResult1 === null ? 'null' : dropResult1.type ?? 'actor'
                                } stillOwned=${stillOwned}`;
                            }
                        }
                    }
                } catch (err) {
                    notes['item-drop-non-droppable-returns-null'] = `flow threw: ${err instanceof Error ? err.message : String(err)}`;
                }
            }

            /* ============================================================
             * Flow 9: item-drop-no-token-returns-null
             * dropItemFromActor with a droppable item but no active
             * token for the actor must return null via the
             * "no token on scene" branch (the actor has no placed token
             * since we never created a scene token for it).
             * ============================================================ */
            async function probeDropNoToken(): Promise<void> {
                try {
                    const live = getPc();
                    if (live == null) {
                        notes['item-drop-no-token-returns-null'] = 'PC actor unavailable';
                    } else {
                        const mod = (await import(itemDropUrl)) as { ItemDropManager?: ItemDropManagerLike; default?: ItemDropManagerLike };
                        const IDM = mod.ItemDropManager ?? mod.default;
                        const created = await withTimeout(
                            live.createEmbeddedDocuments?.('Item', [{ name: 'probe-notoken-gear', type: 'gear', system: { quantity: 1 } }]) ??
                                Promise.resolve(undefined),
                            'create gear',
                        );
                        const createdId = created?.at(0)?.id ?? '';
                        const gear = createdId !== '' ? live.items?.get?.(createdId) : undefined;
                        if (gear == null || typeof IDM?.dropItemFromActor !== 'function') {
                            notes['item-drop-no-token-returns-null'] = 'gear create failed';
                        } else {
                            cleanups.push(async () => {
                                try {
                                    await gear.delete?.();
                                } catch {
                                    /* ignore */
                                }
                            });
                            const dropResult2 = await withTimeout(IDM.dropItemFromActor(live, gear), 'dropItemFromActor(no token)');
                            const stillOwned = live.items?.get?.(gear.id ?? '') !== undefined;
                            if (dropResult2 === null && stillOwned) {
                                fired['item-drop-no-token-returns-null'] = true;
                                notes['item-drop-no-token-returns-null'] = 'no-active-token branch returned null, item retained';
                            } else {
                                notes['item-drop-no-token-returns-null'] = `result=${
                                    dropResult2 === null ? 'null' : dropResult2.type ?? 'actor'
                                } stillOwned=${stillOwned}`;
                            }
                        }
                    }
                } catch (err) {
                    notes['item-drop-no-token-returns-null'] = `flow threw: ${err instanceof Error ? err.message : String(err)}`;
                }
            }

            /* ============================================================
             * Flow 10: item-drop-creates-loot-pile
             * Create a transient Scene, place a token for the PC, view
             * the scene so `canvas.scene` resolves, then drop a gear
             * item. dropItemFromActor must create a `loot` Actor +
             * token, transfer the item, and remove it from the PC.
             * The created loot actor is reused by Flow 11 (pickup).
             * ============================================================ */
            async function probeCreatesLootPile(): Promise<void> {
                let dropScene: SceneLike | null = null;
                try {
                    const live = getPc();
                    if (live == null || SceneGbl?.create == null) {
                        notes['item-drop-creates-loot-pile'] = 'PC actor or Scene.create unavailable';
                    } else {
                        const mod = (await import(itemDropUrl)) as { ItemDropManager?: ItemDropManagerLike; default?: ItemDropManagerLike };
                        const IDM = mod.ItemDropManager ?? mod.default;
                        dropScene = await withTimeout(SceneGbl.create({ name: 'managers-extra-drop-scene' }), 'Scene.create');
                        const scene = dropScene;
                        if (scene?.id != null && typeof IDM?.dropItemFromActor === 'function') {
                            cleanups.push(async () => {
                                try {
                                    await scene.delete?.();
                                } catch {
                                    /* ignore */
                                }
                            });
                            // View the scene so canvas.scene resolves.
                            try {
                                await withTimeout(Promise.resolve(scene.view?.()), 'scene.view');
                            } catch {
                                /* best-effort — canvas may be unavailable headlessly */
                            }
                            const protoData: XProtoToken =
                                typeof live.prototypeToken?.toObject === 'function' ? live.prototypeToken.toObject() : { name: live.name, actorId: live.id };
                            protoData.actorId = live.id;
                            protoData.x = 100;
                            protoData.y = 100;
                            const priorDelta = protoData.delta ?? {};
                            const { system: priorSystem, items: priorItems, effects: priorEffects, flags: priorFlags } = priorDelta;
                            protoData.delta = {
                                system: priorSystem ?? {},
                                items: priorItems ?? [],
                                effects: priorEffects ?? [],
                                flags: priorFlags ?? {},
                            };
                            await withTimeout(scene.createEmbeddedDocuments?.('Token', [protoData]) ?? Promise.resolve(), 'createEmbeddedDocuments(Token)');
                            const created = await withTimeout(
                                live.createEmbeddedDocuments?.('Item', [{ name: 'probe-drop-gear', type: 'gear', system: { quantity: 2 } }]) ??
                                    Promise.resolve(undefined),
                                'create drop gear',
                            );
                            const createdId = created?.at(0)?.id ?? '';
                            const gear = createdId !== '' ? live.items?.get?.(createdId) : undefined;
                            if (gear == null) {
                                notes['item-drop-creates-loot-pile'] = 'drop gear create failed';
                            } else {
                                const dropResult3 = await withTimeout(IDM.dropItemFromActor(live, gear), 'dropItemFromActor(with token)');
                                lootActor = dropResult3;
                                const refreshed = getPc();
                                const gearGone = refreshed?.items?.get?.(gear.id ?? '') === undefined;
                                const lootHasItem =
                                    dropResult3?.type === 'loot' && (dropResult3.items?.contents ?? []).some((i) => i.name === 'probe-drop-gear');
                                // When Item Piles is active the manager hands the drop to
                                // that module — Item Piles owns the pile actor, so
                                // `dropItemFromActor` deliberately returns null after
                                // removing the source item (#385). The item leaving the
                                // actor IS the success condition on that path; scoring it
                                // as a failure is what made this probe red in a world with
                                // the module installed.
                                const viaItemPiles = dropResult3 == null && gearGone && itemPilesActive();
                                if (viaItemPiles) {
                                    fired['item-drop-creates-loot-pile'] = true;
                                    notes['item-drop-creates-loot-pile'] = 'Item Piles active: pile created by the module, item moved off the PC';
                                } else if (dropResult3 != null && gearGone && lootHasItem) {
                                    registerLootCleanup(dropResult3.id);
                                    fired['item-drop-creates-loot-pile'] = true;
                                    notes['item-drop-creates-loot-pile'] = 'loot Actor created, item moved off the PC into the pile';
                                } else {
                                    notes['item-drop-creates-loot-pile'] = `result=${
                                        dropResult3 == null ? 'null' : dropResult3.type ?? 'unknown'
                                    } gearGone=${gearGone} lootHasItem=${String(lootHasItem)} itemPiles=${String(itemPilesActive())} (canvas may be headless)`;
                                }
                            }
                        } else {
                            notes['item-drop-creates-loot-pile'] = 'Scene.create returned no id';
                        }
                    }
                } catch (err) {
                    notes['item-drop-creates-loot-pile'] = `flow threw: ${err instanceof Error ? err.message : String(err)}`;
                }
            }

            /* ============================================================
             * Flow 11: item-drop-pickup-loot
             * pickupLoot moves the pile's items onto a receiver
             * (stack-merging), then deletes the now-empty pile. If the
             * drop flow produced a loot actor we reuse it; otherwise we
             * synthesise a loot actor with an item so the manager path
             * still runs end-to-end.
             * ============================================================ */
            async function probePickupLoot(): Promise<void> {
                try {
                    const live = getPc();
                    if (live == null) {
                        notes['item-drop-pickup-loot'] = 'PC actor unavailable';
                    } else {
                        const mod = (await import(itemDropUrl)) as { ItemDropManager?: ItemDropManagerLike; default?: ItemDropManagerLike };
                        const IDM = mod.ItemDropManager ?? mod.default;
                        const initialPile = lootActor;
                        const pile: LootActor | null =
                            initialPile?.type === 'loot'
                                ? initialPile
                                : (await withTimeout(
                                      ActorGbl?.create?.({ name: 'managers-extra-loot-pile', type: 'loot' }) ?? Promise.resolve(null),
                                      'loot Actor.create',
                                  )) ?? null;
                        const pileId = pile?.id;
                        if (initialPile?.type !== 'loot' && pile != null && pileId != null) {
                            cleanups.push(async () => {
                                try {
                                    await gameGbl?.actors?.get?.(pileId)?.delete?.();
                                } catch {
                                    /* ignore */
                                }
                            });
                            await withTimeout(
                                pile.createEmbeddedDocuments?.('Item', [{ name: 'probe-pickup-gear', type: 'gear', system: { quantity: 3 } }]) ??
                                    Promise.resolve([]),
                                'stock loot pile',
                            );
                        }
                        const itemCount = pile?.items?.contents?.length ?? 0;
                        if (pile == null || pileId == null || itemCount === 0 || typeof IDM?.pickupLoot !== 'function') {
                            notes['item-drop-pickup-loot'] = `no usable loot pile (id=${String(pileId)} items=${itemCount})`;
                        } else {
                            const ok = await withTimeout(IDM.pickupLoot(live, pile), 'pickupLoot');
                            const refreshedPc = getPc();
                            const receivedSomething = (refreshedPc?.items?.contents ?? []).some(
                                (i) => i.name === 'probe-drop-gear' || i.name === 'probe-pickup-gear',
                            );
                            const pileDeleted = gameGbl?.actors?.get?.(pileId) === undefined;
                            if (ok && receivedSomething && pileDeleted) {
                                fired['item-drop-pickup-loot'] = true;
                                notes['item-drop-pickup-loot'] = 'pile items merged onto receiver and the empty pile was deleted';
                            } else {
                                notes['item-drop-pickup-loot'] = `ok=${String(ok)} received=${receivedSomething} pileDeleted=${pileDeleted}`;
                            }
                        }
                    }
                } catch (err) {
                    notes['item-drop-pickup-loot'] = `flow threw: ${err instanceof Error ? err.message : String(err)}`;
                }
            }

            /* ============================================================
             * Flow 12: inventory-generator-collect-candidates
             * collectCandidates(gameSystem) scans the system Item
             * compendium packs scoped to the system pack prefix and
             * projects droppable entries to InventoryCandidate shapes.
             * Assert it returns an array of well-formed candidates
             * (uuid/name/type/profiles) and excludes non-droppable
             * types. Per-system: also call with 'im' so the
             * homologated scoping path is exercised, not just dh2.
             * ============================================================ */
            async function probeCollectCandidates(): Promise<void> {
                try {
                    const mod = (await import(inventoryGeneratorUrl)) as {
                        InventoryGeneratorManager?: InventoryGeneratorManagerLike;
                        default?: InventoryGeneratorManagerLike;
                    };
                    const IGM = mod.InventoryGeneratorManager ?? mod.default;
                    if (typeof IGM?.collectCandidates !== 'function') {
                        notes['inventory-generator-collect-candidates'] = 'collectCandidates unavailable';
                    } else {
                        const dh2 = await withTimeout(IGM.collectCandidates('dh2'), 'collectCandidates(dh2)', COLLECT_CANDIDATES_TIMEOUT_MS);
                        const im = await withTimeout(IGM.collectCandidates('im'), 'collectCandidates(im)', COLLECT_CANDIDATES_TIMEOUT_MS);
                        const shapeOk = dh2.every(
                            (c) =>
                                typeof c.uuid === 'string' &&
                                c.uuid.startsWith('Compendium.') &&
                                typeof c.name === 'string' &&
                                typeof c.type === 'string' &&
                                Array.isArray(c.profiles),
                        );
                        // No candidate may be a non-droppable type (skill /
                        // talent / etc.) — collectCandidates filters via
                        // ItemDropManager.isDroppable.
                        const noOwnershipFacts = dh2.every((c) => !['skill', 'talent', 'trait', 'aptitude', 'condition', 'originPath'].includes(c.type ?? ''));
                        const sorted =
                            dh2.length < 2 || dh2.every((c, idx) => idx === 0 || String(dh2[idx - 1].name ?? '').localeCompare(String(c.name ?? '')) <= 0);
                        if (shapeOk && noOwnershipFacts && sorted) {
                            fired['inventory-generator-collect-candidates'] = true;
                            notes[
                                'inventory-generator-collect-candidates'
                            ] = `dh2=${dh2.length} candidates, im=${im.length} candidates; shapes valid, droppable-only, name-sorted`;
                        } else {
                            notes[
                                'inventory-generator-collect-candidates'
                            ] = `shapeOk=${shapeOk} noOwnershipFacts=${noOwnershipFacts} sorted=${sorted} dh2Len=${dh2.length}`;
                        }
                    }
                } catch (err) {
                    notes['inventory-generator-collect-candidates'] = `flow threw: ${err instanceof Error ? err.message : String(err)}`;
                }
            }

            /* ============================================================
             * Flow 13: inventory-generator-apply-to-actor
             * applyToActor(actor, [uuid]) resolves the compendium docs,
             * runs ItemDropManager.planStackMerge against the actor's
             * inventory, and creates / stack-bumps the items. We pick
             * the first dh2 candidate and apply it twice — the first
             * call creates, the second stack-merges (when the item is
             * stackable) or creates a second copy. Assert the actor
             * gained the item and applyToActor returned a positive
             * count.
             * ============================================================ */
            async function probeApplyToActor(): Promise<void> {
                try {
                    const live = getPc();
                    const igMod = (await import(inventoryGeneratorUrl)) as {
                        InventoryGeneratorManager?: InventoryGeneratorManagerLike;
                        default?: InventoryGeneratorManagerLike;
                    };
                    const IGM = igMod.InventoryGeneratorManager ?? igMod.default;
                    if (live == null) {
                        notes['inventory-generator-apply-to-actor'] = 'PC actor unavailable';
                    } else if (typeof IGM?.applyToActor !== 'function' || typeof IGM.collectCandidates !== 'function') {
                        notes['inventory-generator-apply-to-actor'] = 'applyToActor/collectCandidates unavailable';
                    } else {
                        const candidates = await withTimeout(IGM.collectCandidates('dh2'), 'collectCandidates for apply', COLLECT_CANDIDATES_TIMEOUT_MS);
                        const candidate = candidates.find((c) => typeof c.uuid === 'string');
                        if (candidate?.uuid == null) {
                            notes['inventory-generator-apply-to-actor'] = 'no compendium candidate available to apply';
                        } else {
                            const candidateUuid = candidate.uuid;
                            const beforeCount = live.items?.contents?.length ?? 0;
                            const applied = await withTimeout(IGM.applyToActor(live, [candidateUuid]), 'applyToActor', INVENTORY_APPLY_TIMEOUT_MS);
                            const refreshed = getPc();
                            const afterCount = refreshed?.items?.contents?.length ?? 0;
                            const gained = afterCount > beforeCount;
                            if (typeof applied === 'number' && applied > 0 && gained) {
                                // Track every freshly-created item for cleanup.
                                cleanups.push(async () => {
                                    try {
                                        const a = getPc();
                                        const extra = (a?.items?.contents ?? []).filter((i) => i.name === candidate.name);
                                        if (extra.length > 0 && a != null) {
                                            await a.deleteEmbeddedDocuments?.(
                                                'Item',
                                                extra.map((i) => i.id ?? '').filter((id) => id !== ''),
                                            );
                                        }
                                    } catch {
                                        /* ignore */
                                    }
                                });
                                fired['inventory-generator-apply-to-actor'] = true;
                                notes['inventory-generator-apply-to-actor'] = `applied ${applied} item(s); actor inventory ${beforeCount} → ${afterCount}`;
                            } else {
                                notes['inventory-generator-apply-to-actor'] = `applied=${String(applied)} before=${beforeCount} after=${afterCount}`;
                            }
                        }
                    }
                } catch (err) {
                    notes['inventory-generator-apply-to-actor'] = `flow threw: ${err instanceof Error ? err.message : String(err)}`;
                }
            }

            /* ============================================================
             * Flow 14: inventory-generator-permission-denied
             * applyToActor must warn and return null when the target
             * actor is not owned by the current user. We synthesise a
             * plain stub with `isOwner=false` (applyToActor reads only
             * `isOwner` before bailing); the manager's permission gate
             * is content-agnostic plumbing, so a stub is sufficient and
             * needs no real document.
             * ============================================================ */
            async function probePermissionDenied(): Promise<void> {
                try {
                    const mod = (await import(inventoryGeneratorUrl)) as {
                        InventoryGeneratorManager?: InventoryGeneratorManagerLike;
                        default?: InventoryGeneratorManagerLike;
                    };
                    const IGM = mod.InventoryGeneratorManager ?? mod.default;
                    if (typeof IGM?.applyToActor !== 'function') {
                        notes['inventory-generator-permission-denied'] = 'applyToActor unavailable';
                    } else {
                        const notOwned = { isOwner: false, name: 'unowned-stub-actor', items: [] };
                        const permResult = await withTimeout(
                            IGM.applyToActor(notOwned, ['Compendium.wh40k-rpg.dh2-gear.NonExistent']),
                            'applyToActor(not owner)',
                        );
                        if (permResult === null) {
                            fired['inventory-generator-permission-denied'] = true;
                            notes['inventory-generator-permission-denied'] = 'non-owner short-circuited to null (permission gate)';
                        } else {
                            notes['inventory-generator-permission-denied'] = `expected null, got ${JSON.stringify(permResult)}`;
                        }
                    }
                } catch (err) {
                    notes['inventory-generator-permission-denied'] = `flow threw: ${err instanceof Error ? err.message : String(err)}`;
                }
            }

            try {
                await probeRegisterSettings();
                await probeSetGetResolved();
                await probeIsAvailable();
                await probeBlockingReasons();
                await probeComputeStates();
                await probeBuildContentHtml();
                await probeOpenDialog();
                await probeMacroAndSceneControl();
                await probeDayBarAndResolveToggle();
                await probePcAttitudeEdit();
                await probeJournalLinks();
                await probeSceneButtons();
                await probeSharedActors();
                await probeDropNonDroppable();
                await probeDropNoToken();
                await probeCreatesLootPile();
                await probePickupLoot();
                await probeCollectCandidates();
                await probeApplyToActor();
                await probePermissionDenied();
            } finally {
                // Best-effort cleanup of everything we created.
                // REVERSE (LIFO): the host actor is registered before the items embedded
                // in it, so draining in insertion order deletes the parent first and
                // every child delete then targets a document whose parent is gone.
                for (const fn of [...cleanups].reverse()) {
                    try {
                        await fn();
                    } catch {
                        /* ignore */
                    }
                }
                try {
                    await closeOpenDialogs();
                } catch {
                    /* ignore */
                }
            }

            return { flowsFired: fired, flowNotes: notes, canvasReady: g.canvas?.ready === true };
        },
        {
            flows: MANAGERS_EXTRA_FLOWS,
            eventTrackerUrl: EVENT_TRACKER_MODULE_URL,
            itemDropUrl: ITEM_DROP_MODULE_URL,
            inventoryGeneratorUrl: INVENTORY_GENERATOR_MODULE_URL,
        },
    );

    return {
        flowsFired: result.flowsFired,
        flowNotes: result.flowNotes,
        canvasReady: result.canvasReady,
    };
}

test.describe.serial('managers/* extra coverage (Tier B)', () => {
    // Cap at 4 minutes — per-call timeouts mean we should never come close.
    test.setTimeout(scaledMs(240_000));
    test('event-tracker / item-drop / inventory-generator manager flows', async ({ page }) => {
        await joinOrSkip(page);

        const probe = await probeManagersExtraFlows(page);

        const failures: string[] = [];
        // Flows that place a token on a scene and then write to its actor. Every
        // such write reaches Foundry's `RenderFlags#set`, which dereferences
        // `canvas.pendingRenderFlags` — undefined until the canvas initialises.
        // Without a canvas these cannot run at all, so they are SKIPPED rather
        // than failed, and deliberately left out of recordCoverage so the
        // dimension percentage keeps reporting the gap honestly (the same
        // treatment scene-controls-hud.spec.ts gives its canvas-gated flow).
        const canvasGatedFlows: Set<FlowName> = new Set(['item-drop-creates-loot-pile', 'item-drop-pickup-loot', 'inventory-generator-apply-to-actor']);
        for (const flow of MANAGERS_EXTRA_FLOWS) {
            if (probe.flowsFired[flow]) {
                recordCoverage('managers-extra.flow', flow);
                continue;
            }
            const note = probe.flowNotes[flow] ?? 'flow did not fire and no diagnostic note recorded';
            if (canvasGatedFlows.has(flow) && !probe.canvasReady) {
                console.warn(`managers-extra.flow ${flow} skipped (no canvas): ${note}`);
                continue;
            }
            failures.push(`flow ${flow}: ${note}`);
        }

        expect(failures, `${failures.length}/${MANAGERS_EXTRA_FLOWS.length} managers-extra probes failed:\n  - ${failures.join('\n  - ')}`).toEqual([]);
    });
});
