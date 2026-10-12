/**
 * Event completion hooks (#591): the trigger evaluators, reference resolution
 * precedence, the availability gate, and the watcher that turns Foundry hooks
 * into automatic resolutions on the active GM only.
 */

import { afterEach, describe, expect, it, type Mock, vi } from 'vitest';
import { DEAD_STATUS_ID } from '../constants.ts';
import {
    type CompletionEnvironment,
    EventCompletionWatcher,
    effectStatusChanges,
    identifyActor,
    identifyDoc,
    registerEventCompletionHooks,
} from './event-completion.ts';
import {
    autoResolutions,
    type CompletionTrigger,
    createRefResolver,
    type EventGraph,
    effectStatusTransitions,
    type GameStateChange,
    type IdentifiedActor,
    type IdentifiedDoc,
    type RefCollection,
    type RefResolver,
    type ResolvedState,
    refMatchTier,
    triggerFires,
} from './event-graph.ts';
import { EventTracker } from './event-tracker.ts';

const SYSTEM_ID = 'wh40k-rpg';
const SLATE_UUID = 'Compendium.wh40k-rpg.dh2-gear.Item.DataSlate0000001';

const ANA_REF = { name: 'Ana Vell', path: 'Characters/NPCs/Ana Vell.md' };
const SLATE_REF = { name: 'Map Slate', path: 'Items/Map Slate.md' };
const HAB_REF = { name: 'Hab District 4', path: 'Locations/Hab District 4.md' };

function actor(name: string, opts: { party?: boolean; vault?: { path: string; name: string } } = {}): IdentifiedActor {
    return { name, vault: opts.vault, sources: [`Actor.${name}`], isPartyMember: opts.party ?? false };
}

function doc(name: string, opts: { vault?: { path: string; name: string }; sources?: string[] } = {}): IdentifiedDoc {
    return { name, vault: opts.vault, sources: opts.sources ?? [] };
}

/** A resolver over a fixed world. */
function resolverOver(world: Partial<Record<RefCollection, IdentifiedDoc[]>> = {}): RefResolver {
    return createRefResolver((collection) => world[collection] ?? []);
}

const PC = actor('Acolyte Kael', { party: true });
const NPC = actor('Ana Vell');

describe('refMatchTier', () => {
    it('matches by the vault identity flag first, even after a rename', () => {
        expect(refMatchTier(ANA_REF, doc('Renamed By GM', { vault: { path: ANA_REF.path, name: 'Ana Vell' } }))).toBe('vault');
    });

    it('matches the vault identity by name when the vault path moved', () => {
        expect(refMatchTier(ANA_REF, doc('Ana Vell', { vault: { path: 'Characters/Old/Ana Vell.md', name: 'Ana Vell' } }))).toBe('vault');
    });

    it('falls back to the exact document name', () => {
        expect(refMatchTier(ANA_REF, doc('Ana Vell'))).toBe('name');
        expect(refMatchTier(ANA_REF, doc('ana vell'))).toBeNull();
    });

    it('matches a compendium UUID reference against the document sources only', () => {
        expect(refMatchTier({ uuid: SLATE_UUID }, doc('Anything', { sources: [SLATE_UUID] }))).toBe('compendium');
        expect(refMatchTier({ uuid: SLATE_UUID }, doc(SLATE_UUID))).toBeNull();
    });
});

describe('createRefResolver precedence', () => {
    const flagged = doc('Ana (renamed)', { vault: { path: ANA_REF.path, name: 'Ana Vell' } });
    const sameName = doc('Ana Vell');

    it('a name-only match yields to a document carrying the vault identity', () => {
        const resolver = resolverOver({ actor: [flagged, sameName] });
        expect(resolver.matches(ANA_REF, flagged, 'actor')).toBe(true);
        expect(resolver.matches(ANA_REF, sameName, 'actor')).toBe(false);
    });

    it('a name match stands when no document carries the vault identity', () => {
        expect(resolverOver({ actor: [sameName] }).matches(ANA_REF, sameName, 'actor')).toBe(true);
    });

    it('only the same collection takes precedence', () => {
        expect(resolverOver({ scene: [flagged] }).matches(ANA_REF, sameName, 'actor')).toBe(true);
    });
});

describe('triggerFires', () => {
    const resolver = resolverOver();
    const slate = doc('Map Slate', { sources: [SLATE_UUID] });

    describe('item-acquired', () => {
        const acquired = (holder: IdentifiedActor, item = slate): GameStateChange => ({ kind: 'item-acquired', item, holder });

        it('fires when a player character acquires the item (no holder = the party)', () => {
            const trigger: CompletionTrigger = { kind: 'item-acquired', item: SLATE_REF };
            expect(triggerFires(trigger, acquired(PC), resolver)).toBe(true);
            expect(triggerFires(trigger, acquired(NPC), resolver)).toBe(false);
        });

        it('holder `party` is any player character', () => {
            const trigger: CompletionTrigger = { kind: 'item-acquired', item: SLATE_REF, holder: 'party' };
            expect(triggerFires(trigger, acquired(PC), resolver)).toBe(true);
            expect(triggerFires(trigger, acquired(NPC), resolver)).toBe(false);
        });

        it('a holder reference fires for that actor only, PC or not', () => {
            const trigger: CompletionTrigger = { kind: 'item-acquired', item: SLATE_REF, holder: ANA_REF };
            expect(triggerFires(trigger, acquired(NPC), resolver)).toBe(true);
            expect(triggerFires(trigger, acquired(PC), resolver)).toBe(false);
        });

        it('matches a compendium item by its source UUID', () => {
            const trigger: CompletionTrigger = { kind: 'item-acquired', item: { uuid: SLATE_UUID } };
            expect(triggerFires(trigger, acquired(PC, doc('Data-Slate (worn)', { sources: [SLATE_UUID] })), resolver)).toBe(true);
            expect(triggerFires(trigger, acquired(PC, doc('Map Slate')), resolver)).toBe(false);
        });

        it('ignores other items and other change kinds', () => {
            const trigger: CompletionTrigger = { kind: 'item-acquired', item: SLATE_REF };
            expect(triggerFires(trigger, acquired(PC, doc('Lasgun')), resolver)).toBe(false);
            expect(triggerFires(trigger, { kind: 'event-resolved', eventId: 'X' }, resolver)).toBe(false);
        });
    });

    describe('actor-died', () => {
        const trigger: CompletionTrigger = { kind: 'actor-died', actor: ANA_REF };

        it('fires when the actor gains the dead status', () => {
            expect(triggerFires(trigger, { kind: 'actor-status', actor: NPC, status: 'dead', change: 'gained' }, resolver)).toBe(true);
        });

        it('does not fire on revival, another status, or another actor', () => {
            expect(triggerFires(trigger, { kind: 'actor-status', actor: NPC, status: 'dead', change: 'lost' }, resolver)).toBe(false);
            expect(triggerFires(trigger, { kind: 'actor-status', actor: NPC, status: 'unconscious', change: 'gained' }, resolver)).toBe(false);
            expect(triggerFires(trigger, { kind: 'actor-status', actor: PC, status: 'dead', change: 'gained' }, resolver)).toBe(false);
        });
    });

    describe('actor-status', () => {
        const trigger: CompletionTrigger = { kind: 'actor-status', actor: ANA_REF, status: 'stunned', change: 'lost' };

        it('fires on the named status and direction', () => {
            expect(triggerFires(trigger, { kind: 'actor-status', actor: NPC, status: 'stunned', change: 'lost' }, resolver)).toBe(true);
        });

        it('does not fire on the other direction or another status', () => {
            expect(triggerFires(trigger, { kind: 'actor-status', actor: NPC, status: 'stunned', change: 'gained' }, resolver)).toBe(false);
            expect(triggerFires(trigger, { kind: 'actor-status', actor: NPC, status: 'prone', change: 'lost' }, resolver)).toBe(false);
        });
    });

    describe('scene-entered', () => {
        const trigger: CompletionTrigger = { kind: 'scene-entered', location: HAB_REF };
        const habScene = doc('Hab Block Battlemap', { vault: { path: HAB_REF.path, name: HAB_REF.name } });

        it('fires when a player character token is on the location scene', () => {
            expect(triggerFires(trigger, { kind: 'scene-entered', scene: habScene, actor: PC }, resolver)).toBe(true);
        });

        it('matches an unflagged scene by name', () => {
            expect(triggerFires(trigger, { kind: 'scene-entered', scene: doc('Hab District 4'), actor: PC }, resolver)).toBe(true);
        });

        it('ignores NPC tokens and other scenes', () => {
            expect(triggerFires(trigger, { kind: 'scene-entered', scene: habScene, actor: NPC }, resolver)).toBe(false);
            expect(triggerFires(trigger, { kind: 'scene-entered', scene: doc('Space Port'), actor: PC }, resolver)).toBe(false);
        });
    });

    describe('event-resolved', () => {
        it('fires on the named event only', () => {
            const trigger: CompletionTrigger = { kind: 'event-resolved', event: 'MEET_ANA' };
            expect(triggerFires(trigger, { kind: 'event-resolved', eventId: 'MEET_ANA' }, resolver)).toBe(true);
            expect(triggerFires(trigger, { kind: 'event-resolved', eventId: 'OTHER' }, resolver)).toBe(false);
        });
    });
});

describe('autoResolutions (availability gate)', () => {
    const resolver = resolverOver();
    const meet: GameStateChange = { kind: 'event-resolved', eventId: 'MEET_ANA' };
    const graph: EventGraph = {
        MEET_ANA: { name: 'Meet Ana' },
        GATED: { name: 'Gated', requires: 'PREREQ', completion: [{ kind: 'event-resolved', event: 'MEET_ANA' }] },
        FORCED: { name: 'Forced', requires: 'PREREQ', completion: [{ kind: 'event-resolved', event: 'MEET_ANA', ignoreRequirements: true }] },
        OPEN: { name: 'Open', completion: [{ kind: 'event-resolved', event: 'MEET_ANA' }] },
        MANUAL: { name: 'Manual' },
        PREREQ: { name: 'Prereq' },
    };
    const ids = (resolved: ResolvedState, skip?: Set<string>): string[] => autoResolutions(graph, resolved, meet, resolver, skip).map((r) => r.eventId);

    it('resolves available events and those whose trigger ignores requirements', () => {
        expect(ids({})).toEqual(['FORCED', 'OPEN']);
    });

    it('resolves a gated event once its requirements are met', () => {
        expect(ids({ PREREQ: { resolvedAt: 'x' } })).toEqual(['GATED', 'FORCED', 'OPEN']);
    });

    it('skips resolved events and the skip set', () => {
        expect(ids({ OPEN: { resolvedAt: 'x' } }, new Set(['FORCED']))).toEqual([]);
    });

    it('never touches an event without completion triggers', () => {
        expect(ids({ PREREQ: { resolvedAt: 'x' } })).not.toContain('MANUAL');
    });

    it('reports the trigger that fired', () => {
        expect(autoResolutions(graph, {}, meet, resolver).at(0)?.trigger).toEqual({ kind: 'event-resolved', event: 'MEET_ANA', ignoreRequirements: true });
    });
});

describe('effect status transitions', () => {
    it('a status counts only when no other enabled effect already carries it', () => {
        expect(effectStatusTransitions(['dead', 'prone'], new Set(['prone']))).toEqual(['dead']);
    });

    it('effectStatusChanges reads the bearer’s other enabled effects', () => {
        const bearer = {
            name: 'Ana Vell',
            uuid: 'Actor.ana',
            flags: {},
            hasPlayerOwner: false,
            effects: [
                { id: 'e1', disabled: false, statuses: new Set(['dead']) },
                { id: 'e2', disabled: false, statuses: new Set(['prone']) },
                { id: 'e3', disabled: true, statuses: new Set(['dead']) },
            ],
        };
        const changes = effectStatusChanges({ id: 'e1', disabled: false, statuses: new Set(['dead']) }, bearer, 'gained');
        expect(changes).toEqual([{ kind: 'actor-status', actor: identifyActor(bearer), status: 'dead', change: 'gained' }]);
        const stacked = effectStatusChanges({ id: 'e4', disabled: false, statuses: new Set(['prone']) }, bearer, 'gained');
        expect(stacked).toEqual([]);
    });
});

describe('identifyDoc', () => {
    it('collects compendium source, legacy sourceId and own UUID, skipping blanks', () => {
        const identified = identifyDoc(
            {
                name: 'Slate',
                uuid: 'Actor.a.Item.b',
                flags: { [SYSTEM_ID]: { vault: { path: 'Items/Slate.md', name: 'Slate' } } },
                _stats: { compendiumSource: SLATE_UUID },
            },
            'Compendium.legacy',
        );
        expect(identified).toEqual({
            name: 'Slate',
            vault: { path: 'Items/Slate.md', name: 'Slate' },
            sources: [SLATE_UUID, 'Compendium.legacy', 'Actor.a.Item.b'],
        });
        expect(identifyDoc({ name: null, uuid: null, flags: {}, _stats: { compendiumSource: null } }, undefined)).toEqual({
            name: '',
            vault: undefined,
            sources: [],
        });
    });

    it('also stands for the world document an item was duplicated from', () => {
        const owned = identifyDoc(
            { name: 'Ledger', uuid: 'Actor.a.Item.c', flags: {}, _stats: { compendiumSource: null, duplicateSource: 'Item.worldLedger' } },
            undefined,
        );
        expect(owned.sources).toEqual(['Item.worldLedger', 'Actor.a.Item.c']);
    });
});

describe('identifyActor', () => {
    const base = { name: 'Orrin Vael', flags: {}, hasPlayerOwner: false };

    it('lets an unlinked token stand for its base world actor, so an Adventure actor reference matches it (#592)', () => {
        const token = identifyActor({ ...base, uuid: 'Scene.s.Token.t.Actor.orrin', id: 'orrin', isToken: true });
        expect(token.sources).toEqual(['Scene.s.Token.t.Actor.orrin', 'Actor.orrin']);
        const resolver = createRefResolver(() => []);
        const change = { kind: 'actor-status', actor: token, status: DEAD_STATUS_ID, change: 'gained' } as const;
        expect(triggerFires({ kind: 'actor-died', actor: { uuid: 'Actor.orrin' } }, change, resolver)).toBe(true);
    });

    it('adds nothing for a world actor, which already carries its own UUID', () => {
        expect(identifyActor({ ...base, uuid: 'Actor.orrin', id: 'orrin', isToken: false }).sources).toEqual(['Actor.orrin']);
    });
});

/** A watcher environment over an in-memory resolved state. */
type ResolveFn = (eventId: string, detail: string) => Promise<void>;

interface FakeEnv extends CompletionEnvironment {
    state: ResolvedState;
    suppressedIds: Set<string>;
    resolve: Mock<ResolveFn>;
    announce: Mock<ResolveFn>;
}

function fakeEnv(graph: EventGraph, opts: { gm?: boolean } = {}): FakeEnv {
    const env = {
        state: {} as ResolvedState,
        suppressedIds: new Set<string>(),
        suppressed: () => env.suppressedIds,
        isActiveGM: () => opts.gm ?? true,
        graph: () => graph,
        resolved: () => env.state,
        resolver: () => resolverOver(),
        describe: (trigger: CompletionTrigger) => `fired ${trigger.kind}`,
        resolve: vi.fn<ResolveFn>(async (eventId) => {
            await Promise.resolve();
            env.state = { ...env.state, [eventId]: { resolvedAt: 'now', origin: 'auto' } };
        }),
        announce: vi.fn<ResolveFn>(async () => Promise.resolve()),
    };
    return env;
}

const DIED: GameStateChange = { kind: 'actor-status', actor: NPC, status: 'dead', change: 'gained' };
const DEATH_GRAPH: EventGraph = { ANA_DIES: { name: 'Ana Dies', completion: [{ kind: 'actor-died', actor: ANA_REF }] } };

describe('EventCompletionWatcher', () => {
    it('resolves with origin detail and whispers the GM', async () => {
        const env = fakeEnv(DEATH_GRAPH);
        const watcher = new EventCompletionWatcher(env);
        await expect(watcher.notify(DIED)).resolves.toHaveLength(1);
        expect(env.resolve).toHaveBeenCalledWith('ANA_DIES', 'fired actor-died');
        expect(env.announce).toHaveBeenCalledWith('ANA_DIES', 'fired actor-died');
    });

    it('does nothing off the active GM client', async () => {
        const env = fakeEnv(DEATH_GRAPH, { gm: false });
        await expect(new EventCompletionWatcher(env).notify(DIED)).resolves.toEqual([]);
        expect(env.resolve).not.toHaveBeenCalled();
        expect(env.announce).not.toHaveBeenCalled();
    });

    it('does nothing without a loaded graph', async () => {
        const env = { ...fakeEnv(DEATH_GRAPH), graph: () => null };
        await expect(new EventCompletionWatcher(env).notify(DIED)).resolves.toEqual([]);
    });

    it('never double-fires when the same change arrives twice at once', async () => {
        const env = fakeEnv(DEATH_GRAPH);
        const watcher = new EventCompletionWatcher(env);
        await Promise.all([watcher.notify(DIED), watcher.notify(DIED)]);
        expect(env.resolve).toHaveBeenCalledTimes(1);
        expect(env.announce).toHaveBeenCalledTimes(1);
    });

    it('skips a suppressed event, and fires again once the suppression is lifted', async () => {
        const env = fakeEnv(DEATH_GRAPH);
        env.suppressedIds.add('ANA_DIES');
        const watcher = new EventCompletionWatcher(env);
        await expect(watcher.notify(DIED)).resolves.toEqual([]);
        env.suppressedIds.clear();
        await expect(watcher.notify(DIED)).resolves.toHaveLength(1);
    });

    it('chains through event-resolved triggers and stops on a cycle', async () => {
        // START fires on the death; A chains off START; B off A; A also chains off B (a cycle).
        const graph: EventGraph = {
            START: { name: 'Start', completion: [{ kind: 'actor-died', actor: ANA_REF }] },
            A: {
                name: 'A',
                completion: [
                    { kind: 'event-resolved', event: 'START' },
                    { kind: 'event-resolved', event: 'B' },
                ],
            },
            B: { name: 'B', completion: [{ kind: 'event-resolved', event: 'A' }] },
        };
        const env = fakeEnv(graph);
        const watcher = new EventCompletionWatcher(env);
        // The live env feeds each resolution back through the eventResolved hook.
        env.resolve.mockImplementation(async (eventId) => {
            env.state = { ...env.state, [eventId]: { resolvedAt: 'now', origin: 'auto' } };
            await Promise.resolve();
            void watcher.notify({ kind: 'event-resolved', eventId });
        });
        await watcher.notify(DIED);
        await vi.waitFor(() => {
            expect(env.resolve.mock.calls.map(([id]) => id)).toEqual(['START', 'A', 'B']);
        });
        // Draining the queue resolves nothing more: B's resolution finds A already resolved.
        await watcher.notify({ kind: 'event-resolved', eventId: 'NONE' });
        expect(env.resolve).toHaveBeenCalledTimes(3);
    });

    it('keeps working after a failed resolution', async () => {
        const env = fakeEnv(DEATH_GRAPH);
        env.resolve.mockRejectedValueOnce(new Error('settings write failed'));
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const watcher = new EventCompletionWatcher(env);
        await expect(watcher.notify(DIED)).rejects.toThrow('settings write failed');
        await expect(watcher.notify({ kind: 'event-resolved', eventId: 'X' })).resolves.toEqual([]);
    });
});

/* -------------------------------------------- */
/*  Hook wiring                                 */
/* -------------------------------------------- */

type Handler = (...args: never[]) => void;

/** Capture `Hooks.on` registrations. */
function stubHooks(): Map<string, Handler> {
    const handlers = new Map<string, Handler>();
    vi.stubGlobal('Hooks', {
        on: (event: string, fn: Handler) => {
            handlers.set(event, fn);
            return handlers.size;
        },
    });
    return handlers;
}

function fire(handlers: Map<string, Handler>, event: string, ...args: object[]): void {
    const handler = handlers.get(event) as ((...payload: object[]) => void) | undefined;
    if (handler === undefined) throw new Error(`no handler for ${event}`);
    handler(...args);
}

const pcActor = { name: 'Acolyte Kael', uuid: 'Actor.kael', flags: {}, hasPlayerOwner: true, effects: [] };

describe('registerEventCompletionHooks', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        EventTracker._graph = null;
    });

    function setup(): { handlers: Map<string, Handler>; notify: ReturnType<typeof vi.fn> } {
        const handlers = stubHooks();
        const watcher = new EventCompletionWatcher(fakeEnv({}));
        const notify = vi.fn(async () => Promise.resolve([]));
        watcher.notify = notify;
        registerEventCompletionHooks(watcher);
        return { handlers, notify };
    }

    it('createItem on an actor is an item acquisition', () => {
        const { handlers, notify } = setup();
        vi.stubGlobal('foundry', { utils: { getProperty: () => 'Compendium.legacy' } });
        fire(handlers, 'createItem', { name: 'Slate', uuid: 'Actor.kael.Item.s', flags: {}, _stats: { compendiumSource: SLATE_UUID }, parent: pcActor });
        expect(notify).toHaveBeenCalledWith({
            kind: 'item-acquired',
            item: { name: 'Slate', vault: undefined, sources: [SLATE_UUID, 'Compendium.legacy', 'Actor.kael.Item.s'] },
            holder: identifyActor(pcActor),
        });
    });

    it('createItem on a world item (no parent) is ignored', () => {
        const { handlers, notify } = setup();
        fire(handlers, 'createItem', { name: 'Slate', uuid: 'Item.s', flags: {}, parent: null });
        expect(notify).not.toHaveBeenCalled();
    });

    it('active effects map to gained / lost statuses, and enable toggles count', () => {
        const { handlers, notify } = setup();
        const effect = { id: 'e1', disabled: false, statuses: new Set(['dead']), parent: pcActor };
        fire(handlers, 'createActiveEffect', effect);
        fire(handlers, 'deleteActiveEffect', effect);
        fire(handlers, 'updateActiveEffect', { ...effect, disabled: true }, { disabled: true });
        fire(handlers, 'updateActiveEffect', effect, { name: 'renamed' });
        const changes = notify.mock.calls.map(([change]) => (change as { change: string }).change);
        expect(changes).toEqual(['gained', 'lost', 'lost']);
    });

    it('a disabled effect created or deleted changes nothing, nor does an item-borne one', () => {
        const { handlers, notify } = setup();
        fire(handlers, 'createActiveEffect', { id: 'e1', disabled: true, statuses: new Set(['dead']), parent: pcActor });
        fire(handlers, 'createActiveEffect', { id: 'e2', disabled: false, statuses: new Set(['dead']), parent: { name: 'Item' } });
        expect(notify).not.toHaveBeenCalled();
    });

    it('token placement and movement on a scene are scene entries; other updates are not', () => {
        const { handlers, notify } = setup();
        const scene = { name: 'Hab District 4', uuid: 'Scene.h', flags: {} };
        const token = { actor: pcActor, parent: scene };
        fire(handlers, 'createToken', token);
        fire(handlers, 'updateToken', token, { x: 100 });
        fire(handlers, 'updateToken', token, { hidden: true });
        fire(handlers, 'createToken', { actor: null, parent: scene });
        expect(notify).toHaveBeenCalledTimes(2);
        expect(notify).toHaveBeenCalledWith({ kind: 'scene-entered', scene: identifyDoc(scene, undefined), actor: identifyActor(pcActor) });
    });

    it('canvasReady reports every token on the viewed scene', () => {
        const { handlers, notify } = setup();
        const scene = { name: 'Hab District 4', uuid: 'Scene.h', flags: {}, tokens: [] as object[] };
        scene.tokens.push({ actor: pcActor, parent: scene }, { actor: pcActor, parent: scene });
        vi.stubGlobal('canvas', { scene });
        fire(handlers, 'canvasReady', {});
        expect(notify).toHaveBeenCalledTimes(2);
    });

    it('a resolved event is a chain change; an un-resolve is not', () => {
        const { handlers, notify } = setup();
        const handler = handlers.get('wh40k-rpg.eventResolved') as ((id: string, resolved: boolean) => void) | undefined;
        handler?.('MEET_ANA', true);
        handler?.('MEET_ANA', false);
        expect(notify).toHaveBeenCalledExactlyOnceWith({ kind: 'event-resolved', eventId: 'MEET_ANA' });
    });

    /** The live watcher's world: the active-GM flag decides whether it acts. */
    function liveWorld(isActiveGM: boolean): {
        set: Mock<(scope: string, key: string, value: ResolvedState) => Promise<void>>;
        create: Mock<(data: object) => Promise<void>>;
        handlers: Map<string, Handler>;
    } {
        const handlers = stubHooks();
        const set = vi.fn<(scope: string, key: string, value: ResolvedState) => Promise<void>>(async () => Promise.resolve());
        const create = vi.fn<(data: object) => Promise<void>>(async () => Promise.resolve());
        vi.stubGlobal('game', {
            users: { activeGM: { isSelf: isActiveGM } },
            user: { id: 'gm', isGM: true },
            settings: { get: () => ({}), set },
            i18n: { localize: (key: string) => key, format: (key: string, data: Record<string, string>) => `${key}:${JSON.stringify(data)}` },
            actors: { contents: [] },
            scenes: { contents: [] },
        });
        vi.stubGlobal('Hooks', { on: (event: string, fn: Handler) => handlers.set(event, fn).size, callAll: vi.fn() });
        vi.stubGlobal('foundry', { applications: { handlebars: { renderTemplate: async () => Promise.resolve('<div></div>') } } });
        vi.stubGlobal('ChatMessage', { create, getWhisperRecipients: () => ['gm'] });
        EventTracker._graph = DEATH_GRAPH;
        registerEventCompletionHooks();
        return { set, create, handlers };
    }

    const anaDies = { id: 'e1', disabled: false, statuses: new Set(['dead']), parent: { ...pcActor, name: 'Ana Vell', hasPlayerOwner: false } };

    it('the live watcher resolves and whispers on the active GM client', async () => {
        const { set, create, handlers } = liveWorld(true);
        fire(handlers, 'createActiveEffect', anaDies);
        await vi.waitFor(() => {
            expect(create).toHaveBeenCalledOnce();
        });
        const [scope, key, stored] = set.mock.calls.at(0) ?? [];
        expect([scope, key]).toEqual([SYSTEM_ID, 'event-tracker-state']);
        expect(stored?.['ANA_DIES']?.origin).toBe('auto');
        expect(stored?.['ANA_DIES']?.detail).toBe('WH40K.EventTracker.Auto.ActorDied:{"actor":"Ana Vell"}');
        expect(create).toHaveBeenCalledWith({ user: 'gm', content: '<div></div>', whisper: ['gm'] });
    });

    it('the live watcher writes nothing on a client that is not the active GM', async () => {
        const { set, create, handlers } = liveWorld(false);
        fire(handlers, 'createActiveEffect', anaDies);
        await new Promise((resolve) => {
            setTimeout(resolve, 0);
        });
        expect(set).not.toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled();
    });
});

/* -------------------------------------------- */
/*  Persisted GM undo (#591)                    */
/* -------------------------------------------- */

/** A store-backed world: settings survive a simulated reload (fresh modules, same store). */
function persistentWorld(store: Map<string, object>, isGM: boolean, isActiveGM: boolean): Map<string, Handler> {
    const handlers = new Map<string, Handler>();
    vi.stubGlobal('game', {
        users: { activeGM: { isSelf: isActiveGM } },
        user: { id: 'gm', isGM },
        settings: {
            register: (scope: string, key: string, config: { default: object }) => {
                if (!store.has(`${scope}.${key}`)) store.set(`${scope}.${key}`, config.default);
            },
            get: (scope: string, key: string) => store.get(`${scope}.${key}`),
            set: async (scope: string, key: string, value: object) => {
                store.set(`${scope}.${key}`, value);
                return Promise.resolve(value);
            },
        },
        i18n: { localize: (key: string) => key, format: (key: string) => key },
        actors: { contents: [] },
        scenes: { contents: [] },
    });
    vi.stubGlobal('Hooks', {
        on: (event: string, fn: Handler) => handlers.set(event, fn).size,
        callAll: (event: string, ...args: never[]) => handlers.get(event)?.(...args),
    });
    vi.stubGlobal('foundry', { applications: { handlebars: { renderTemplate: async () => Promise.resolve('') } } });
    vi.stubGlobal('ChatMessage', { create: async () => Promise.resolve(), getWhisperRecipients: () => [] });
    return handlers;
}

/** Boot the tracker and watcher from fresh module state, as a reload or another GM client would. */
async function boot(
    store: Map<string, object>,
    opts: { isGM?: boolean; isActiveGM?: boolean } = {},
): Promise<{
    tracker: typeof EventTracker;
    handlers: Map<string, Handler>;
}> {
    const handlers = persistentWorld(store, opts.isGM ?? true, opts.isActiveGM ?? true);
    vi.resetModules();
    const trackerModule = await import('./event-tracker.ts');
    const completion = await import('./event-completion.ts');
    const tracker = trackerModule.EventTracker;
    tracker.registerSettings();
    tracker._graph = DEATH_GRAPH;
    completion.registerEventCompletionHooks();
    return { tracker, handlers };
}

const anaDeath = { id: 'e1', disabled: false, statuses: new Set(['dead']), parent: { ...pcActor, name: 'Ana Vell', hasPlayerOwner: false } };

describe('a GM undo of an automatic resolution persists', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.resetModules();
    });

    it('survives a reload: the next trigger leaves the undone event alone', async () => {
        const store = new Map<string, object>();
        const first = await boot(store);
        fire(first.handlers, 'createActiveEffect', anaDeath);
        await vi.waitFor(() => {
            expect(first.tracker.getResolved()).toMatchObject({ ANA_DIES: { origin: 'auto' } });
        });
        await first.tracker.setResolved('ANA_DIES', false);
        expect(first.tracker.getAutoSuppressed()).toEqual(['ANA_DIES']);

        const reloaded = await boot(store);
        expect(reloaded.tracker.getAutoSuppressed()).toEqual(['ANA_DIES']);
        fire(reloaded.handlers, 'createActiveEffect', anaDeath);
        fire(reloaded.handlers, 'createActiveEffect', { ...anaDeath, id: 'e2' });
        await new Promise((resolve) => {
            setTimeout(resolve, 0);
        });
        expect(reloaded.tracker.getResolved()).toEqual({});
    });

    it('a manual re-resolve clears the suppression, so the next undo suppresses again', async () => {
        const store = new Map<string, object>();
        const { tracker } = await boot(store);
        await tracker.setResolved('ANA_DIES', true, { origin: 'auto', detail: 'died' });
        await tracker.setResolved('ANA_DIES', false);
        expect(tracker.getAutoSuppressed()).toEqual(['ANA_DIES']);
        await tracker.setResolved('ANA_DIES', true);
        expect(tracker.getAutoSuppressed()).toEqual([]);
        // Resolved by hand now, so un-resolving it is not an undo of an automatic resolution.
        await tracker.setResolved('ANA_DIES', false);
        expect(tracker.getAutoSuppressed()).toEqual([]);
    });

    it('only a manual undo suppresses; a sync or auto un-resolve does not', async () => {
        const store = new Map<string, object>();
        const { tracker } = await boot(store);
        await tracker.setResolved('ANA_DIES', true, { origin: 'auto' });
        await tracker.setResolved('ANA_DIES', false, { origin: 'sync' });
        expect(tracker.getAutoSuppressed()).toEqual([]);
    });

    it('suppression is GM-only: a player cannot write it', async () => {
        const store = new Map<string, object>();
        const gm = await boot(store);
        await gm.tracker.setResolved('ANA_DIES', true, { origin: 'auto' });
        const player = await boot(store, { isGM: false, isActiveGM: false });
        await expect(player.tracker.setResolved('ANA_DIES', false)).rejects.toThrow('GM-only');
        expect(player.tracker.getAutoSuppressed()).toEqual([]);
    });

    it('a malformed stored set reads as empty', async () => {
        const store = new Map<string, object>();
        const { tracker } = await boot(store);
        store.set('wh40k-rpg.event-tracker-auto-suppressed', { ANA_DIES: true });
        expect(tracker.getAutoSuppressed()).toEqual([]);
    });
});
