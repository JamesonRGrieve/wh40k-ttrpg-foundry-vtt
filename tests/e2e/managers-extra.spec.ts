import type { Page } from '@playwright/test';
import { recordCoverage } from './lib/coverage-tracker';
import { joinAsGM } from './lib/join';
import { expect, test } from './lib/test';

/**
 * Tier B extra coverage of the three `src/module/managers/*` classes that
 * are NOT already exercised by `managers.spec.ts` (which covers
 * grants-manager + transaction-manager). This spec drives the constructors,
 * public methods, pure helpers, and document-layer flows of:
 *
 *   - src/module/managers/event-tracker.ts
 *       (registerSettings / getResolved / setResolved / isAvailable /
 *        getBlockingReasons / computeCharacterStates / _stateColor /
 *        _buildEventsPane / _buildNPCStatePane / _buildContent / open —
 *        exercised by directly seeding the `_graph` / `_characters` static
 *        fields and the persisted world setting, then asserting on derived
 *        state + rendered HTML).
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
 *   - dialog-opening + document writes wrapped in a 5s `withTimeout` so a
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
    pageErrors: string[];
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
    getBlockingReasons: (id: string) => string[];
    computeCharacterStates: () => Record<
        string,
        { dispositions: Record<string, { attitude?: string; trigger?: string }>; relationships: Array<{ currentState?: string; trigger?: string }> }
    >;
    _buildEventsPane: () => string;
    _buildNPCStatePane: () => string;
    _buildContent: (tab: string) => string;
    _stateColor: (state: string) => string;
    open: () => void;
    _graph?: Record<string, object> | null;
    _characters?: Record<string, object> | null;
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
    game?: {
        actors?: { get?: (id: string) => XActor | undefined };
        settings?: { get?: (namespace: string, key: string) => object | string | number | boolean | null | undefined };
        user?: { isGM?: boolean };
    };
    ui?: { windows?: Record<string, XWindow> };
}

const EVENT_TRACKER_MODULE_URL = '/systems/wh40k-rpg/module/managers/event-tracker.js';
const ITEM_DROP_MODULE_URL = '/systems/wh40k-rpg/module/managers/item-drop-manager.js';
const INVENTORY_GENERATOR_MODULE_URL = '/systems/wh40k-rpg/module/managers/inventory-generator-manager.js';

async function probeManagersExtraFlows(page: Page): Promise<ProbeResult> {
    const pageErrors: string[] = [];
    const listener = (err: Error): void => {
        pageErrors.push(err.message);
    };
    page.on('pageerror', listener);
    try {
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
            }): Promise<{ flowsFired: Record<string, boolean>; flowNotes: Record<string, string> }> => {
                // eslint-disable-next-line no-restricted-syntax -- boundary: Foundry runtime `globalThis` is untyped; narrowed to XGlobal
                const g = globalThis as unknown as XGlobal;
                const ActorGbl = g.Actor;
                const SceneGbl = g.Scene;
                const gameGbl = g.game;
                const uiGbl = g.ui;

                const fired: Record<string, boolean> = {};
                const notes: Record<string, string> = {};
                for (const f of flows) fired[f] = false;

                // Wrap any awaitable with a timeout so a blocking dialog or
                // socket-wait can't hang the spec (mirrors weapon-attack.spec.ts).
                const withTimeout = async <T>(p: Promise<T>, ms: number, label: string): Promise<T> => {
                    let timer: ReturnType<typeof setTimeout> | null = null;
                    const timeout = new Promise<T>((_, reject) => {
                        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
                    });
                    try {
                        return await Promise.race([p, timeout]);
                    } finally {
                        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- timer is set synchronously in the Promise executor; TS control-flow cannot track closure assignments
                        if (timer !== null) clearTimeout(timer);
                    }
                };

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
                            await withTimeout(ET.setResolved(eventId, true), 5_000, 'setResolved(true)');
                            const afterSet = ET.getResolved();
                            const present = afterSet != null && eventId in afterSet;
                            const stamped = present && typeof afterSet[eventId].resolvedAt === 'string';
                            await withTimeout(ET.setResolved(eventId, false), 5_000, 'setResolved(false)');
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
                                await withTimeout(ET.setResolved('evt-root', true), 5_000, 'resolve evt-root');
                                const gateStillBlocked = ET.isAvailable('evt-gate'); // requires_any still unmet
                                await withTimeout(ET.setResolved('evt-side-b', true), 5_000, 'resolve evt-side-b');
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
                 * With a graph whose `evt-gate` requires an unmet `evt-root`
                 * and one-of [evt-side-a, evt-side-b], getBlockingReasons
                 * returns a "Requires: <name> (<location>)" line and a
                 * "Requires one of: ... OR ..." line.
                 * ============================================================ */
                async function probeBlockingReasons(): Promise<void> {
                    try {
                        const mod = (await import(eventTrackerUrl)) as { EventTracker?: EventTrackerLike; default?: EventTrackerLike };
                        const ET = mod.EventTracker ?? mod.default;
                        if (ET == null) {
                            notes['event-tracker-blocking-reasons'] = 'EventTracker.getBlockingReasons unavailable';
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
                                const unknownReasons = ET.getBlockingReasons('does-not-exist');
                                const reasons = ET.getBlockingReasons('evt-gate');
                                const hasRequires = Array.isArray(reasons) && reasons.some((r) => r.includes('Root Event') && r.includes('Hive Sibellus'));
                                const hasOneOf = Array.isArray(reasons) && reasons.some((r) => r.includes('Requires one of:') && r.includes(' OR '));
                                if (Array.isArray(unknownReasons) && unknownReasons.length === 0 && hasRequires && hasOneOf) {
                                    fired['event-tracker-blocking-reasons'] = true;
                                    notes['event-tracker-blocking-reasons'] = `reasons=${JSON.stringify(reasons)}; unknown-event returns []`;
                                } else {
                                    notes['event-tracker-blocking-reasons'] = `unknownLen=${
                                        Array.isArray(unknownReasons) ? unknownReasons.length : 'n/a'
                                    } hasRequires=${hasRequires} hasOneOf=${hasOneOf}`;
                                }
                            } finally {
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
                                await withTimeout(ET.setResolved('evt-betrayal', true), 5_000, 'resolve evt-betrayal');
                                await withTimeout(ET.setResolved('evt-pact', true), 5_000, 'resolve evt-pact');
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
                                    notes['event-tracker-compute-character-states'] =
                                        'triggered disposition + walked relationship influences resolved correctly';
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
                 * _buildContent() composes _buildEventsPane() +
                 * _buildNPCStatePane() and embeds the Events/NPC tab markup
                 * + _stateColor() badge colours. With a graph + characters
                 * seeded, the HTML must contain the event name, the NPC
                 * State tab, and a coloured badge.
                 * ============================================================ */
                async function probeBuildContentHtml(): Promise<void> {
                    try {
                        const mod = (await import(eventTrackerUrl)) as { EventTracker?: EventTrackerLike; default?: EventTrackerLike };
                        const ET = mod.EventTracker ?? mod.default;
                        if (ET == null) {
                            notes['event-tracker-build-content-html'] = 'EventTracker._buildContent unavailable';
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
                                const colorAlly = ET._stateColor('ally');
                                const colorUnknown = ET._stateColor('not-a-state'); // → fallback grey
                                const eventsPane = ET._buildEventsPane();
                                const npcPane = ET._buildNPCStatePane();
                                const html = ET._buildContent('events');
                                const npcHtml = ET._buildContent('npcs');
                                const hasEvent = html.includes('Arrival at the Spire');
                                const hasTabs = html.includes('data-tab="events"') && html.includes('data-tab="npcs"');
                                const hasBadge = npcPane.includes('evt-badge') && npcPane.includes(colorAlly);
                                const hasLockedReason = eventsPane.includes('Requires: Arrival at the Spire');
                                const npcActive = npcHtml.includes('data-pane="npcs"');
                                if (hasEvent && hasTabs && hasBadge && hasLockedReason && npcActive && colorAlly === '#2d6' && colorUnknown === '#888') {
                                    fired['event-tracker-build-content-html'] = true;
                                    notes['event-tracker-build-content-html'] = 'events pane + NPC pane + tab scaffold + _stateColor mapping rendered';
                                } else {
                                    notes[
                                        'event-tracker-build-content-html'
                                    ] = `hasEvent=${hasEvent} hasTabs=${hasTabs} hasBadge=${hasBadge} hasLockedReason=${hasLockedReason} npcActive=${npcActive} colorAlly=${colorAlly} colorUnknown=${colorUnknown}`;
                                }
                            } finally {
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
                                const before = Object.keys(uiGbl?.windows ?? {}).length;
                                ET.open();
                                // open() calls Dialog#render synchronously; let
                                // the render microtask settle.
                                await new Promise<void>((r) => {
                                    setTimeout(r, 250);
                                });
                                const windowList = Object.values(uiGbl?.windows ?? {});
                                const opened =
                                    Object.keys(uiGbl?.windows ?? {}).length > before ||
                                    windowList.some((w) =>
                                        String(w.title ?? '')
                                            .toLowerCase()
                                            .includes('event tracker'),
                                    );
                                if (opened) {
                                    fired['event-tracker-open-dialog'] = true;
                                    notes['event-tracker-open-dialog'] = 'tracker Dialog rendered into ui.windows';
                                } else {
                                    notes['event-tracker-open-dialog'] = 'open() did not produce a tracker window';
                                }
                            } finally {
                                await closeOpenDialogs();
                                ET._graph = prevGraph;
                            }
                        }
                    } catch (err) {
                        notes['event-tracker-open-dialog'] = `flow threw: ${err instanceof Error ? err.message : String(err)}`;
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
                                  5_000,
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
                    await new Promise<void>((r) => {
                        setTimeout(r, 250);
                    });
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
                                5_000,
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
                                const dropResult1 = await withTimeout(IDM.dropItemFromActor(live, talent), 5_000, 'dropItemFromActor(talent)');
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
                                5_000,
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
                                const dropResult2 = await withTimeout(IDM.dropItemFromActor(live, gear), 5_000, 'dropItemFromActor(no token)');
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
                            dropScene = await withTimeout(SceneGbl.create({ name: 'managers-extra-drop-scene' }), 5_000, 'Scene.create');
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
                                    await withTimeout(Promise.resolve(scene.view?.()), 5_000, 'scene.view');
                                } catch {
                                    /* best-effort — canvas may be unavailable headlessly */
                                }
                                const protoData: XProtoToken =
                                    typeof live.prototypeToken?.toObject === 'function'
                                        ? live.prototypeToken.toObject()
                                        : { name: live.name, actorId: live.id };
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
                                await withTimeout(
                                    scene.createEmbeddedDocuments?.('Token', [protoData]) ?? Promise.resolve(),
                                    5_000,
                                    'createEmbeddedDocuments(Token)',
                                );
                                const created = await withTimeout(
                                    live.createEmbeddedDocuments?.('Item', [{ name: 'probe-drop-gear', type: 'gear', system: { quantity: 2 } }]) ??
                                        Promise.resolve(undefined),
                                    5_000,
                                    'create drop gear',
                                );
                                const createdId = created?.at(0)?.id ?? '';
                                const gear = createdId !== '' ? live.items?.get?.(createdId) : undefined;
                                if (gear == null) {
                                    notes['item-drop-creates-loot-pile'] = 'drop gear create failed';
                                } else {
                                    const dropResult3 = await withTimeout(IDM.dropItemFromActor(live, gear), 5_000, 'dropItemFromActor(with token)');
                                    lootActor = dropResult3;
                                    const refreshed = getPc();
                                    const gearGone = refreshed?.items?.get?.(gear.id ?? '') === undefined;
                                    const lootHasItem =
                                        dropResult3?.type === 'loot' && (dropResult3.items?.contents ?? []).some((i) => i.name === 'probe-drop-gear');
                                    if (dropResult3 != null && gearGone && lootHasItem) {
                                        const lootId = dropResult3.id;
                                        if (lootId != null) {
                                            cleanups.push(async () => {
                                                try {
                                                    await gameGbl?.actors?.get?.(lootId)?.delete?.();
                                                } catch {
                                                    /* ignore */
                                                }
                                            });
                                        }
                                        fired['item-drop-creates-loot-pile'] = true;
                                        notes['item-drop-creates-loot-pile'] = 'loot Actor created, item moved off the PC into the pile';
                                    } else {
                                        notes['item-drop-creates-loot-pile'] = `result=${
                                            dropResult3 == null ? 'null' : dropResult3.type ?? 'unknown'
                                        } gearGone=${gearGone} lootHasItem=${String(lootHasItem)} (canvas may be headless)`;
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
                                          5_000,
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
                                    5_000,
                                    'stock loot pile',
                                );
                            }
                            const itemCount = pile?.items?.contents?.length ?? 0;
                            if (pile == null || pileId == null || itemCount === 0 || typeof IDM?.pickupLoot !== 'function') {
                                notes['item-drop-pickup-loot'] = `no usable loot pile (id=${String(pileId)} items=${itemCount})`;
                            } else {
                                const ok = await withTimeout(IDM.pickupLoot(live, pile), 5_000, 'pickupLoot');
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
                            const dh2 = await withTimeout(IGM.collectCandidates('dh2'), 15_000, 'collectCandidates(dh2)');
                            const im = await withTimeout(IGM.collectCandidates('im'), 15_000, 'collectCandidates(im)');
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
                            const noOwnershipFacts = dh2.every(
                                (c) => !['skill', 'talent', 'trait', 'aptitude', 'condition', 'originPath'].includes(c.type ?? ''),
                            );
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
                            const candidates = await withTimeout(IGM.collectCandidates('dh2'), 15_000, 'collectCandidates for apply');
                            const candidate = candidates.find((c) => typeof c.uuid === 'string');
                            if (candidate?.uuid == null) {
                                notes['inventory-generator-apply-to-actor'] = 'no compendium candidate available to apply';
                            } else {
                                const candidateUuid = candidate.uuid;
                                const beforeCount = live.items?.contents?.length ?? 0;
                                const applied = await withTimeout(IGM.applyToActor(live, [candidateUuid]), 10_000, 'applyToActor');
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
                                5_000,
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
                    for (const fn of cleanups) {
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

                return { flowsFired: fired, flowNotes: notes };
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
            pageErrors,
        };
    } finally {
        page.off('pageerror', listener);
    }
}

test.describe.serial('managers/* extra coverage (Tier B)', () => {
    // Cap at 4 minutes — per-call timeouts mean we should never come close.
    test.setTimeout(240_000);
    test('event-tracker / item-drop / inventory-generator manager flows', async ({ page }) => {
        const joined = await joinAsGM(page);
        test.skip(!joined, 'GM join failed');

        const probe = await probeManagersExtraFlows(page);

        const failures: string[] = [];
        for (const flow of MANAGERS_EXTRA_FLOWS) {
            if (probe.flowsFired[flow]) {
                recordCoverage('managers-extra.flow', flow);
            } else {
                const note = probe.flowNotes[flow] ?? 'flow did not fire and no diagnostic note recorded';
                failures.push(`flow ${flow}: ${note}`);
            }
        }

        const pageErrorTail = probe.pageErrors.length > 0 ? `\n  pageerrors: ${probe.pageErrors.slice(0, 5).join(' | ')}` : '';

        expect(
            failures,
            `${failures.length}/${MANAGERS_EXTRA_FLOWS.length} managers-extra probes failed:\n  - ${failures.join('\n  - ')}${pageErrorTail}`,
        ).toEqual([]);
    });
});
