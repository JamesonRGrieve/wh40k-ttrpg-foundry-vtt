/**
 * Solenne Campaign — Event Tracker (domain + public API).
 *
 * The system is the single owner of the campaign Event Tracker state:
 *
 * - the GM-only event graph (loaded from a flagged JournalEntry, #33);
 * - which events are resolved (`event-tracker-state` world setting);
 * - the current campaign day (`event-tracker-campaign-day` world setting);
 * - each PC's attitude toward each NPC (`event-tracker-pc-attitudes` world setting).
 *
 * Usage: `game.wh40k.EventTracker.open()` (or the WH40K scene-control button).
 *
 * Integrations (e.g. a Kanka sync module) read and write that state ONLY through
 * this class's public API and the hooks it fires — see {@link EventTracker}.
 * The system itself has no knowledge of any external sync target.
 */

import { SYSTEM_ID } from '../constants.ts';
import { t } from '../i18n/t.ts';
import {
    type ChangeOrigin,
    type CharacterState,
    type ComputedCharacterState,
    computeCharacterStates,
    type EventGraph,
    findJournalUuid,
    isEventAvailable,
    isPcAttitudeMap,
    isResolved,
    isResolvedState,
    isStoredCampaignDay,
    isValidCampaignDay,
    type JournalLinkResolver,
    type JournalRef,
    lookup,
    type NamedJournal,
    omitKey,
    type PcAttitudeMap,
    type ResolvedState,
    resolveJournalUuid,
    withPcAttitude,
} from './event-graph.ts';

interface EventDataFile {
    events: EventGraph;
    version?: number;
    characters?: Record<string, CharacterState> | null;
}

/** World-setting keys (scope `wh40k-rpg`) that hold the tracker's state. */
export const EVENT_TRACKER_SETTINGS = {
    /** `{ [eventId]: { resolvedAt: ISO string } }` */
    resolved: 'event-tracker-state',
    /** Non-negative integer campaign day (`>= 100` reads as `Day M<n-100>`). */
    campaignDay: 'event-tracker-campaign-day',
    /** `{ [npcName]: { [pcName]: attitude } }` */
    pcAttitudes: 'event-tracker-pc-attitudes',
} as const;

/** The hooks fired after each Event Tracker state change. Payloads are typed in `foundry-v14-overrides.d.ts`. */
export const EVENT_TRACKER_HOOKS = {
    eventResolved: 'wh40k-rpg.eventResolved',
    campaignDayChanged: 'wh40k-rpg.campaignDayChanged',
    pcAttitudeChanged: 'wh40k-rpg.pcAttitudeChanged',
} as const;

/** Options accepted by every Event Tracker setter. */
export interface EventTrackerChangeOptions {
    /**
     * Who is making the change (default `'manual'`).
     *
     * - `'manual'`: the GM, by hand (the dashboard).
     * - `'sync'`: a sync adapter applying state it PULLED from a remote source.
     *   The write still happens and the hook still fires, but with
     *   `context.origin === 'sync'`, so the adapter's own push listener skips it
     *   — the echo-loop guard.
     * - `'auto'`: an automatic completion trigger (e.g. game state resolving an event).
     */
    origin?: ChangeOrigin;
    /** Free-text provenance (e.g. which trigger fired), carried to the hook and, for events, stored. */
    detail?: string;
}

/** The final argument of every Event Tracker hook. */
export interface EventTrackerChangeContext {
    readonly origin: ChangeOrigin;
    readonly detail?: string;
}

/**
 * Flag key on the GM-only JournalEntry that carries the graph (#33).
 *
 * `deploy.sh` writes `flags[SYSTEM_ID][EVENT_GRAPH_FLAG] = {version, events,
 * characters}` onto a JournalEntry with `ownership.default = NONE`. The flag is
 * also how the document is FOUND, so renaming or refiling it is safe.
 */
export const EVENT_GRAPH_FLAG = 'eventGraph';

/**
 * True when a flag payload carries the `events` map the tracker needs.
 *
 * The flag is written by `deploy.sh` from the vault export, so nothing about its
 * shape is guaranteed at this boundary — a half-written or hand-edited document
 * must leave the tracker empty rather than crash the ready hook.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: type guard over an untyped Foundry document flag (`flags['wh40k-rpg']` is declared Record<string, unknown> in FlagConfig)
function isEventDataFile(value: unknown): value is EventDataFile {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    if (!('events' in value)) return false;
    const events = value.events;
    return events !== null && typeof events === 'object' && !Array.isArray(events);
}

/** A narrowing guard over a stored setting value. */
// eslint-disable-next-line no-restricted-syntax -- boundary: the guard's input is Foundry's untyped `game.settings.get` value
type SettingGuard<T> = (value: unknown) => value is T;

/** Read one of the tracker's world settings through its guard; a malformed stored value reads as `fallback`. */
function readSetting<T>(key: string, guard: SettingGuard<T>, fallback: T): T {
    // eslint-disable-next-line no-restricted-syntax -- boundary: game.settings.get returns Foundry's untyped stored value; `guard` narrows it on the next line
    const stored: unknown = game.settings.get(SYSTEM_ID, key);
    return guard(stored) ? stored : fallback;
}

function changeContext(options: EventTrackerChangeOptions): EventTrackerChangeContext {
    return { origin: options.origin ?? 'manual', ...(options.detail !== undefined ? { detail: options.detail } : {}) };
}

/**
 * The campaign Event Tracker — domain state and the public API published as
 * `game.wh40k.EventTracker`.
 *
 * **Reads** work on any client (a player client simply has no graph).
 * **Writes are GM-only**: every setter rejects with an `Error` on a non-GM client.
 * Setters are idempotent — writing the value already stored does nothing and
 * fires no hook.
 *
 * **Hooks.** After a setter changes stored state it fires, on the calling client:
 *
 * ```ts
 * Hooks.on('wh40k-rpg.eventResolved', (eventId: string, resolved: boolean, context: EventTrackerChangeContext) => …);
 * Hooks.on('wh40k-rpg.campaignDayChanged', (day: number, context: EventTrackerChangeContext) => …);
 * Hooks.on('wh40k-rpg.pcAttitudeChanged', (npc: string, pc: string, attitude: string, context: EventTrackerChangeContext) => …);
 * ```
 *
 * `attitude` is `''` when the attitude was cleared (the PC has "not met" the NPC).
 *
 * **Origin.** Every setter takes `{ origin?: 'manual' | 'sync' | 'auto', detail?: string }`
 * (default origin `'manual'`), passed through as the hook's `context`; for
 * events it is also stored on the resolved entry. Sync adapters that pull
 * remote state pass `{ origin: 'sync' }` and their own push listener ignores
 * `context.origin === 'sync'` — so a pulled change is never echoed back.
 *
 * **Journal links.** {@link EventTracker.registerJournalLinkResolver} lets an
 * integration map each named reference to its Foundry journal UUID; without
 * one, references resolve by vault identity flag, then by exact journal name.
 */
// biome-ignore lint/complexity/noStaticOnlyClass: stable API surface with static state and many callers
export class EventTracker {
    static _graph: EventGraph | null = null;
    static _characters: Record<string, CharacterState> | null = null;
    static _dataVersion = 1;
    static #journalResolver: JournalLinkResolver | null = null;

    /**
     * Register the world settings that persist the tracker's state.
     * Call during system init.
     */
    static registerSettings(): void {
        game.settings.register(SYSTEM_ID, EVENT_TRACKER_SETTINGS.resolved, {
            name: 'WH40K.Notify.EventTracker.SettingName',
            hint: 'WH40K.Notify.EventTracker.SettingHint',
            scope: 'world',
            config: false,
            type: Object,
            default: {},
        });
        game.settings.register(SYSTEM_ID, EVENT_TRACKER_SETTINGS.campaignDay, {
            name: 'WH40K.EventTracker.Setting.CampaignDayName',
            hint: 'WH40K.EventTracker.Setting.CampaignDayHint',
            scope: 'world',
            config: false,
            type: Number,
            default: 0,
        });
        game.settings.register(SYSTEM_ID, EVENT_TRACKER_SETTINGS.pcAttitudes, {
            name: 'WH40K.EventTracker.Setting.PcAttitudesName',
            hint: 'WH40K.EventTracker.Setting.PcAttitudesHint',
            scope: 'world',
            config: false,
            type: Object,
            default: {},
        });
    }

    /** The loaded event graph, or null when no GM-only graph document was found. */
    static get graph(): EventGraph | null {
        return EventTracker._graph;
    }

    /** Per-character dispositions / relationships, or null when the graph carries none. */
    static get characters(): Record<string, CharacterState> | null {
        return EventTracker._characters;
    }

    /** Schema version of the loaded graph. */
    static get dataVersion(): number {
        return EventTracker._dataVersion;
    }

    /**
     * The graph payload from the GM-only JournalEntry, or undefined.
     *
     * The document is found by FLAG, never by name, so the GM may rename or
     * refile it without breaking the load. A player client never receives the
     * document at all (`ownership.default = NONE`), so this simply returns
     * undefined there — which is the point of the GM-secret ruling on #33.
     */
    static findGraphPayload(): EventDataFile | undefined {
        const journal = game.journal;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- boundary: `game.journal` is undefined until Foundry's `setup` phase
        if (journal === undefined) return undefined;
        for (const entry of journal) {
            // Read `flags` directly rather than `getFlag`: the scope is declared in
            // `types/fvtt-config.ts` FlagConfig, so this needs no cast.
            const payload = entry.flags[SYSTEM_ID]?.[EVENT_GRAPH_FLAG];
            if (isEventDataFile(payload)) return payload;
        }
        return undefined;
    }

    /**
     * Load the event graph from the GM-only JournalEntry in the world.
     * Call during system ready.
     *
     * The graph used to be fetched from `systems/wh40k-rpg/events.json` (#33).
     * Anything under `systems/` is served to every authenticated client, so that
     * transport leaked every unfired event and every GM disposition note to
     * players. The operator's ruling is that the graph is GM-SECRET, and the one
     * Foundry primitive that actually withholds data is document ownership — so
     * it now lives in a JournalEntry with `ownership.default = NONE`, written
     * into the world by `deploy.sh`.
     */
    // eslint-disable-next-line @typescript-eslint/require-await -- the reader is synchronous now; the async signature is the call-site contract (ready hook + e2e probes)
    static async loadGraph(): Promise<void> {
        try {
            const data = EventTracker.findGraphPayload();
            if (data === undefined) {
                console.warn(
                    'EventTracker: no GM-only event-graph document found — run deploy.sh --restart to write it (players never see this document, so this is expected on a player client)',
                );
                return;
            }
            EventTracker._graph = data.events;
            EventTracker._dataVersion = data.version ?? 1;
            EventTracker._characters = data.characters ?? null;
            const charCount = EventTracker._characters ? Object.keys(EventTracker._characters).length : 0;
            console.warn(
                `EventTracker: loaded ${Object.keys(data.events).length} events${
                    charCount > 0 ? `, ${charCount} characters with disposition/relationship data` : ''
                } (schema v${EventTracker._dataVersion})`,
            );
        } catch (err) {
            console.error('EventTracker: failed to load the event-graph document', err);
        }
    }

    /** Reject a write from a non-GM client. */
    static #assertGM(operation: string): void {
        if (!game.user.isGM) throw new Error(`EventTracker.${operation} is GM-only`);
    }

    /* -------------------------------------------- */
    /*  Resolved events                             */
    /* -------------------------------------------- */

    /** Resolved events keyed by event id. A malformed stored value reads as none resolved. */
    static getResolved(): ResolvedState {
        return readSetting(EVENT_TRACKER_SETTINGS.resolved, isResolvedState, {});
    }

    /**
     * Mark an event resolved (or unresolved). GM-only. Fires
     * `wh40k-rpg.eventResolved(eventId, resolved, context)` when the stored state changes.
     */
    static async setResolved(eventId: string, resolved = true, options: EventTrackerChangeOptions = {}): Promise<void> {
        EventTracker.#assertGM('setResolved');
        if (eventId === '') throw new Error('EventTracker.setResolved: eventId must be non-empty');
        const state = EventTracker.getResolved();
        if (isResolved(state, eventId) === resolved) return;
        const context = changeContext(options);
        const next = resolved ? { ...state, [eventId]: { resolvedAt: new Date().toISOString(), ...context } } : omitKey(state, eventId);
        await game.settings.set(SYSTEM_ID, EVENT_TRACKER_SETTINGS.resolved, next);
        Hooks.callAll(EVENT_TRACKER_HOOKS.eventResolved, eventId, resolved, context);
    }

    /** Whether an event's prerequisites are all met. */
    static isAvailable(eventId: string): boolean {
        const graph = EventTracker._graph;
        return graph !== null && isEventAvailable(graph, EventTracker.getResolved(), eventId);
    }

    /* -------------------------------------------- */
    /*  Campaign day                                */
    /* -------------------------------------------- */

    /** The current campaign day (0 when unset or malformed). */
    static getCampaignDay(): number {
        return readSetting(EVENT_TRACKER_SETTINGS.campaignDay, isStoredCampaignDay, 0);
    }

    /**
     * Set the current campaign day (a non-negative integer). GM-only. Fires
     * `wh40k-rpg.campaignDayChanged(day, context)` when the stored day changes.
     */
    static async setCampaignDay(day: number, options: EventTrackerChangeOptions = {}): Promise<void> {
        EventTracker.#assertGM('setCampaignDay');
        if (!isValidCampaignDay(day)) throw new Error(`EventTracker.setCampaignDay: ${day} is not a non-negative integer`);
        if (EventTracker.getCampaignDay() === day) return;
        await game.settings.set(SYSTEM_ID, EVENT_TRACKER_SETTINGS.campaignDay, day);
        Hooks.callAll(EVENT_TRACKER_HOOKS.campaignDayChanged, day, changeContext(options));
    }

    /* -------------------------------------------- */
    /*  Per-PC attitudes                            */
    /* -------------------------------------------- */

    /** Every stored per-PC attitude: `{ [npcName]: { [pcName]: attitude } }`. */
    static getAllPcAttitudes(): PcAttitudeMap {
        return readSetting(EVENT_TRACKER_SETTINGS.pcAttitudes, isPcAttitudeMap, {});
    }

    /** Each PC's attitude toward one NPC: `{ [pcName]: attitude }`. A PC with no entry has not met them. */
    static getPcAttitudes(npc: string): Record<string, string> {
        return lookup(EventTracker.getAllPcAttitudes(), npc) ?? {};
    }

    /**
     * Set one PC's attitude toward one NPC. A blank attitude clears it ("Not Met").
     * GM-only. Fires `wh40k-rpg.pcAttitudeChanged(npc, pc, attitude, context)` when the
     * stored value changes; `attitude` is the trimmed stored value, `''` when cleared.
     */
    static async setPcAttitude(npc: string, pc: string, attitude: string, options: EventTrackerChangeOptions = {}): Promise<void> {
        EventTracker.#assertGM('setPcAttitude');
        if (npc === '' || pc === '') throw new Error('EventTracker.setPcAttitude: npc and pc must be non-empty');
        const map = EventTracker.getAllPcAttitudes();
        const value = attitude.trim();
        if ((lookup(lookup(map, npc) ?? {}, pc) ?? '') === value) return;
        await game.settings.set(SYSTEM_ID, EVENT_TRACKER_SETTINGS.pcAttitudes, withPcAttitude(map, npc, pc, value));
        Hooks.callAll(EVENT_TRACKER_HOOKS.pcAttitudeChanged, npc, pc, value, changeContext(options));
    }

    /* -------------------------------------------- */
    /*  Characters                                  */
    /* -------------------------------------------- */

    /**
     * The current disposition (per target) and relationship state of every
     * character in the graph, recomputed from the resolved events. See
     * {@link computeCharacterStates} for the selection rules.
     */
    static computeCharacterStates(): Record<string, ComputedCharacterState> {
        const characters = EventTracker._characters;
        return characters === null ? {} : computeCharacterStates(characters, EventTracker.getResolved());
    }

    /**
     * Register the function that maps a tracker reference (a character,
     * location, event source, quest or item, by name) to the UUID of its
     * Foundry JournalEntry / JournalEntryPage. The dashboard renders every
     * resolved reference as a native content link, so clicking opens the
     * journal under Foundry's own ownership rules.
     *
     * One resolver at a time: a later registration replaces the earlier one and
     * `null` unregisters it. When no resolver is registered, or it returns null
     * (or throws), the built-in fallback — {@link EventTracker.findJournalByName},
     * a vault-identity then exact-name match over `game.journal` — is used. With neither resolving, the plain name renders.
     */
    static registerJournalLinkResolver(resolver: JournalLinkResolver | null): void {
        EventTracker.#journalResolver = resolver;
    }

    /**
     * The built-in resolver over the world's journals: an entry whose vault
     * identity flag (`flags['wh40k-rpg'].vault`) names the reference wins,
     * preferring an entity type that fits the reference kind; otherwise an
     * exact journal-name match.
     */
    static findJournalByName(this: void, ref: JournalRef): string | null {
        const journal = game.journal;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- boundary: `game.journal` is undefined until Foundry's `setup` phase
        if (journal === undefined) return null;
        const candidates: NamedJournal[] = Array.from(journal, (entry) => ({ name: entry.name, uuid: entry.uuid, vault: entry.flags[SYSTEM_ID]?.vault }));
        return findJournalUuid(candidates, ref);
    }

    /** The journal UUID for a reference (registered resolver first, then the name lookup), or null. */
    static resolveJournalLink(ref: JournalRef): string | null {
        return resolveJournalUuid(ref, EventTracker.#journalResolver, EventTracker.findJournalByName);
    }

    /**
     * Open the GM dashboard. GM only; warns when the graph is not loaded.
     * The dialog module is loaded on demand, so this domain module stays free
     * of the ApplicationV2 runtime (and unit-testable without it).
     */
    static open(): void {
        if (!game.user.isGM) {
            ui.notifications.warn(t('WH40K.Notify.EventTracker.GmOnly'));
            return;
        }
        if (EventTracker._graph === null) {
            ui.notifications.warn(t('WH40K.Notify.EventTracker.GraphNotLoaded'));
            return;
        }
        import('../applications/dialogs/event-tracker-dialog.ts')
            .then(({ default: EventTrackerDialog }) => {
                EventTrackerDialog.show(EventTracker);
            })
            .catch((err: Error) => {
                console.error('EventTracker: failed to open the dashboard', err);
            });
    }
}
