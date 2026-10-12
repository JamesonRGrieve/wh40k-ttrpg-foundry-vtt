/**
 * Event completion hooks (#591): resolve Event Tracker events from game state.
 *
 * Each event in the graph may carry `completion` triggers, authored in the vault
 * (see `CompletionTrigger` in `event-graph.ts`). This module watches the Foundry
 * hooks that carry the matching game state, normalises each into a
 * `GameStateChange`, and resolves every still-unresolved, available event whose
 * trigger fires — through `EventTracker.setResolved(id, true, {origin: 'auto'})`,
 * so the normal `wh40k-rpg.eventResolved` hook fires — then whispers the GM a
 * chat card naming the event and the trigger.
 *
 * Only the active GM acts: every client receives the document hooks, and the
 * resolution is a world write that must happen once.
 *
 * Watched hooks:
 * - `createItem` (an item created on an actor) → `item-acquired`;
 * - `createActiveEffect` / `deleteActiveEffect` / `updateActiveEffect` (enable
 *   toggles) → `actor-status` (and `actor-died` through the `dead` status — the
 *   one death state every route sets, #495);
 * - `createToken`, `updateToken` (position) and `canvasReady` → `scene-entered`;
 * - `wh40k-rpg.eventResolved` → `event-resolved`.
 */

import { SYSTEM_ID } from '../constants.ts';
import { t } from '../i18n/t.ts';
import { hooksOn } from '../utils/hooks-on.ts';
import {
    type AutoResolution,
    autoResolutions,
    type CompletionTrigger,
    createRefResolver,
    type EventGraph,
    effectStatusTransitions,
    type GameStateChange,
    type IdentifiedActor,
    type IdentifiedDoc,
    lookup,
    type RefCollection,
    type RefResolver,
    type ResolvedState,
    type StatusChange,
} from './event-graph.ts';
import { EVENT_TRACKER_HOOKS, EventTracker } from './event-tracker.ts';

/** The GM chat card announcing an automatic resolution. */
const AUTO_RESOLVED_CHAT_TEMPLATE = 'systems/wh40k-rpg/templates/chat/event-auto-resolved-chat.hbs';

/** What the watcher needs from the world. Injected so the decision logic is testable without Foundry. */
export interface CompletionEnvironment {
    /** True on the one client that acts (the active GM). */
    isActiveGM: () => boolean;
    graph: () => EventGraph | null;
    resolved: () => ResolvedState;
    /** Events whose auto-resolution the GM undid; never auto-resolved again. */
    suppressed: () => ReadonlySet<string>;
    resolver: () => RefResolver;
    /** Human description of why the trigger fired. */
    describe: (trigger: CompletionTrigger, change: GameStateChange) => string;
    /** Mark the event resolved with origin `auto`. */
    resolve: (eventId: string, detail: string) => Promise<void>;
    /** Whisper the GM that the event resolved. */
    announce: (eventId: string, detail: string) => Promise<void>;
}

/**
 * Turns game-state changes into automatic resolutions.
 *
 * Changes are handled one at a time, in arrival order, so two hooks fired
 * together cannot both read an event as unresolved and resolve it twice. An
 * event the GM un-resolved after an automatic resolution is in the tracker's
 * persisted suppression set ({@link EventTracker.getAutoSuppressed}) and is
 * skipped, so the undo holds across reloads and GM clients. Chains (an
 * `event-resolved` trigger) terminate: each step resolves an event that was
 * unresolved, and nothing here ever un-resolves one.
 */
export class EventCompletionWatcher {
    readonly #env: CompletionEnvironment;
    #queue: Promise<void> = Promise.resolve();

    constructor(env: CompletionEnvironment) {
        this.#env = env;
    }

    /** Handle one change after every earlier one. Resolves with the events this change resolved. */
    async notify(change: GameStateChange): Promise<AutoResolution[]> {
        if (!this.#env.isActiveGM()) return [];
        const run = this.#queue.then(async () => this.#handle(change));
        this.#queue = run.then(
            () => undefined,
            (err: Error) => {
                console.error('EventCompletion: failed to apply a completion trigger', err);
            },
        );
        return run;
    }

    async #handle(change: GameStateChange): Promise<AutoResolution[]> {
        const graph = this.#env.graph();
        if (graph === null) return [];
        const due = autoResolutions(graph, this.#env.resolved(), change, this.#env.resolver(), this.#env.suppressed());
        // Sequential: each resolution fires the eventResolved hook and must land
        // before the next, and the chat cards follow resolution order.
        await due.reduce(async (previous, { eventId, trigger }) => {
            await previous;
            const detail = this.#env.describe(trigger, change);
            await this.#env.resolve(eventId, detail);
            await this.#env.announce(eventId, detail);
        }, Promise.resolve());
        return due;
    }
}

/* -------------------------------------------- */
/*  Foundry documents → changes                 */
/* -------------------------------------------- */

/** The document fields reference matching reads. */
interface IdentifiableDocument {
    readonly name: string | null;
    readonly uuid: string | null;
    readonly flags: { readonly [SYSTEM_ID]?: { readonly vault?: { readonly path?: string; readonly name?: string } | undefined } | undefined };
    readonly _stats?: { readonly compendiumSource?: string | null | undefined; readonly duplicateSource?: string | null | undefined } | undefined;
}

/** The actor fields the watcher reads. */
interface WatchedActor extends IdentifiableDocument {
    readonly id?: string | null;
    readonly hasPlayerOwner: boolean;
    /** A token's synthetic actor (an unlinked token), whose id is its base actor's. */
    readonly isToken?: boolean;
}

function presentUuids(uuids: ReadonlyArray<string | null | undefined>): string[] {
    return uuids.filter((uuid): uuid is string => typeof uuid === 'string' && uuid !== '');
}

/**
 * A document as the reference matcher sees it: its compendium source,
 * `core.sourceId` (the pre-V12 spelling of it), the world document it was
 * duplicated from (an item dragged from the sidebar onto an actor), and its own UUID.
 */
export function identifyDoc(doc: IdentifiableDocument, legacySourceId: string | undefined): IdentifiedDoc {
    const sources = presentUuids([doc._stats?.compendiumSource, legacySourceId, doc._stats?.duplicateSource, doc.uuid]);
    return { name: doc.name ?? '', vault: doc.flags[SYSTEM_ID]?.vault, sources };
}

/**
 * An actor as the reference matcher sees it. An unlinked token's synthetic actor
 * also stands for its base world actor, so a reference to an Adventure's actor
 * (`Actor.<id>`, #592) matches every token placed from it.
 */
export function identifyActor(actor: WatchedActor): IdentifiedActor {
    const doc = identifyDoc(actor, undefined);
    const base = actor.isToken === true && typeof actor.id === 'string' ? [`Actor.${actor.id}`] : [];
    return { ...doc, sources: [...doc.sources, ...base], isPartyMember: actor.hasPlayerOwner };
}

/** The ActiveEffect fields the watcher reads. */
interface WatchedEffect {
    readonly id: string | null;
    readonly disabled: boolean;
    readonly statuses: ReadonlySet<string>;
}

/** The actor an effect sits on, with its other effects. */
interface EffectBearer extends WatchedActor {
    readonly effects: Iterable<WatchedEffect>;
}

/** Status ids carried by the bearer's enabled effects other than `effect`. */
function otherEffectStatuses(bearer: EffectBearer, effect: WatchedEffect): Set<string> {
    const out = new Set<string>();
    for (const other of bearer.effects) {
        if (other.id === effect.id || other.disabled) continue;
        for (const status of other.statuses) out.add(status);
    }
    return out;
}

/** The `actor-status` changes an effect makes as it starts (`gained`) or stops (`lost`) applying. */
export function effectStatusChanges(effect: WatchedEffect, bearer: EffectBearer, change: StatusChange): GameStateChange[] {
    const actor = identifyActor(bearer);
    return effectStatusTransitions(effect.statuses, otherEffectStatuses(bearer, effect)).map((status) => ({ kind: 'actor-status', actor, status, change }));
}

/** An object with the {@link EffectBearer} surface (an Actor, not an Item parent). */
function isEffectBearer(parent: object | null | undefined): parent is EffectBearer {
    return parent !== null && parent !== undefined && 'hasPlayerOwner' in parent && 'effects' in parent;
}

/* -------------------------------------------- */
/*  Wiring                                      */
/* -------------------------------------------- */

/** The localized display name of a status id (the `CONFIG.statusEffects` row), else the id. */
function statusLabel(status: string): string {
    const row = CONFIG.statusEffects.find((effect) => effect.id === status);
    return row === undefined ? status : game.i18n.localize(row.name);
}

/** A human description of what fired the trigger, naming the documents of the change. */
function describeTrigger(trigger: CompletionTrigger, change: GameStateChange, eventName: (eventId: string) => string): string {
    if (change.kind === 'item-acquired') return t('WH40K.EventTracker.Auto.ItemAcquired', { item: change.item.name, holder: change.holder.name });
    if (change.kind === 'scene-entered') return t('WH40K.EventTracker.Auto.SceneEntered', { actor: change.actor.name, scene: change.scene.name });
    if (change.kind === 'event-resolved') return t('WH40K.EventTracker.Auto.EventResolved', { event: eventName(change.eventId) });
    if (trigger.kind === 'actor-died') return t('WH40K.EventTracker.Auto.ActorDied', { actor: change.actor.name });
    const key = change.change === 'gained' ? 'WH40K.EventTracker.Auto.StatusGained' : 'WH40K.EventTracker.Auto.StatusLost';
    return t(key, { actor: change.actor.name, status: statusLabel(change.status) });
}

function eventDisplayName(eventId: string): string {
    const graph = EventTracker.graph;
    return (graph === null ? undefined : lookup(graph, eventId)?.name) ?? eventId;
}

function worldDocs(collection: RefCollection): IdentifiedDoc[] {
    if (collection === 'actor') return game.actors.contents.map(identifyActor);
    if (collection === 'scene') return game.scenes.contents.map((scene) => identifyDoc(scene, undefined));
    // Every acquired copy of an item counts; items are never narrowed by a world-level vault match.
    return [];
}

async function announce(eventId: string, detail: string): Promise<void> {
    const content = await foundry.applications.handlebars.renderTemplate(AUTO_RESOLVED_CHAT_TEMPLATE, {
        eventName: eventDisplayName(eventId),
        detail,
    });
    await ChatMessage.create({ user: game.user.id, content, whisper: ChatMessage.getWhisperRecipients('GM') });
}

/** The live environment: the active GM, the tracker's graph and state, the world's documents. */
const liveEnvironment: CompletionEnvironment = {
    isActiveGM: () => game.users.activeGM?.isSelf === true,
    graph: () => EventTracker.graph,
    resolved: () => EventTracker.getResolved(),
    suppressed: () => new Set(EventTracker.getAutoSuppressed()),
    resolver: () => createRefResolver(worldDocs),
    describe: (trigger, change) => describeTrigger(trigger, change, eventDisplayName),
    resolve: async (eventId, detail) => EventTracker.setResolved(eventId, true, { origin: 'auto', detail }),
    announce,
};

/** Token fields that move a token. */
const POSITION_KEYS = ['x', 'y'] as const;

/** The scene-entered change for a placed token, or null when it has no actor or scene. */
function tokenSceneChange(token: TokenDocument.Implementation): GameStateChange | null {
    const actor = token.actor;
    const scene = token.parent;
    if (actor === null || scene === null) return null;
    return { kind: 'scene-entered', scene: identifyDoc(scene, undefined), actor: identifyActor(actor) };
}

/**
 * Register the completion watcher's hooks. Call once, at `ready`. Hooks fire on
 * every client; the watcher acts only on the active GM's.
 */
export function registerEventCompletionHooks(watcher: EventCompletionWatcher = new EventCompletionWatcher(liveEnvironment)): void {
    const emit = (change: GameStateChange | null): void => {
        // A failure is already logged by the watcher's queue; the caller has nothing to add.
        if (change !== null) watcher.notify(change).catch(() => undefined);
    };

    hooksOn('createItem', (item: Item.Implementation) => {
        const holder = item.parent;
        if (holder === null) return;
        // `flags.core.sourceId` is the pre-V12 compendium source, absent from the V14 flag typings.
        const legacySource = foundry.utils.getProperty(item, 'flags.core.sourceId');
        emit({ kind: 'item-acquired', item: identifyDoc(item, typeof legacySource === 'string' ? legacySource : undefined), holder: identifyActor(holder) });
    });

    const onEffect = (effect: ActiveEffect.Implementation, change: StatusChange): void => {
        const bearer = effect.parent;
        if (!isEffectBearer(bearer)) return;
        for (const statusChange of effectStatusChanges(effect, bearer, change)) emit(statusChange);
    };
    hooksOn('createActiveEffect', (effect: ActiveEffect.Implementation) => {
        if (!effect.disabled) onEffect(effect, 'gained');
    });
    hooksOn('deleteActiveEffect', (effect: ActiveEffect.Implementation) => {
        if (!effect.disabled) onEffect(effect, 'lost');
    });
    hooksOn('updateActiveEffect', (effect: ActiveEffect.Implementation, changes: { disabled?: boolean }) => {
        if (changes.disabled !== undefined) onEffect(effect, changes.disabled ? 'lost' : 'gained');
    });

    hooksOn('createToken', (token: TokenDocument.Implementation) => {
        emit(tokenSceneChange(token));
    });
    hooksOn('updateToken', (token: TokenDocument.Implementation, changes: Partial<Record<(typeof POSITION_KEYS)[number], number>>) => {
        if (POSITION_KEYS.some((key) => key in changes)) emit(tokenSceneChange(token));
    });
    hooksOn('canvasReady', () => {
        const scene = canvas.scene;
        if (scene === null) return;
        for (const token of scene.tokens) emit(tokenSceneChange(token));
    });

    hooksOn(EVENT_TRACKER_HOOKS.eventResolved, (eventId: string, resolved: boolean) => {
        if (resolved) emit({ kind: 'event-resolved', eventId });
    });
}
