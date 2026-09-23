/**
 * Token-only compendium drops (#586).
 *
 * Foundry's canvas drop imports a WORLD Actor for every compendium actor dropped
 * on a scene (`TokenLayer#_onDropActorData`), so a squad of bestiary mooks or a
 * couple of vehicles litters the sidebar with throwaway actors. Instead, a
 * non-character compendium actor is placed as an UNLINKED token whose base actor
 * is the compendium document itself:
 *
 * - the token's `actorId` is the compendium actor's id (Foundry's ActorDelta
 *   needs a non-null id to exist) and `flags.wh40k-rpg.compendiumActor` records
 *   the compendium UUID;
 * - `TokenDocumentWH40K#baseActor` falls back to this module's per-client cache
 *   of compendium actors when `game.actors` has no such id, so Foundry's own
 *   ActorDelta machinery builds the synthetic actor from the compendium body plus
 *   the token's delta — the token's wounds and edits persist on the token, like
 *   any unlinked token;
 * - `baseActor` is synchronous, so every client loads the flagged compendium
 *   actors at world setup and on token creation, then rebuilds any synthetic
 *   actor that was materialised before its base was cached.
 *
 * Characters always import (they are linked, #479). The world setting
 * `compendium-drop-imports-actor`, or holding Ctrl on the drop, restores Foundry's
 * import.
 */

import { SYSTEM_ID } from '../constants.ts';
import { t } from '../i18n/t.ts';

/** Token flag holding the compendium UUID a token-only actor resolves from. */
const COMPENDIUM_ACTOR_FLAG = 'compendiumActor';

/** The facts the drop decision reads. */
export interface CompendiumDropInput {
    /** Drag-data document type (`Actor`, `Item`, …). */
    type: string | undefined;
    /** Drag-data UUID. */
    uuid: string | undefined;
    /** The dropped actor's type, from the pack index (e.g. `dh2-npc`, `dh2-character`). */
    actorType: string | undefined;
    /** Whether that type is a (linked) character type. */
    isCharacter: boolean;
    /** Ctrl held on drop: import a world actor anyway. */
    ctrlKey: boolean;
    /** The world setting that restores Foundry's import. */
    importSetting: boolean;
}

/**
 * Should this drop place a token-only, compendium-backed token instead of
 * importing a world actor? Only a compendium ACTOR of a non-character type, with
 * neither the Ctrl override nor the import setting on.
 */
export function shouldPlaceTokenOnly(input: CompendiumDropInput): boolean {
    if (input.type !== 'Actor') return false;
    if (input.uuid?.startsWith('Compendium.') !== true) return false;
    if (input.actorType === undefined || input.isCharacter) return false;
    return !input.ctrlKey && !input.importSetting;
}

/** A token document's compendium-actor UUID flag, or null. */
// eslint-disable-next-line no-restricted-syntax -- boundary: TokenDocument#getFlag returns unknown; narrowed by the typeof guard below
export function compendiumActorUuidOf(token: { getFlag: (scope: typeof SYSTEM_ID, key: string) => unknown }): string | null {
    const flag = token.getFlag(SYSTEM_ID, COMPENDIUM_ACTOR_FLAG);
    return typeof flag === 'string' && flag !== '' ? flag : null;
}

/* -------------------------------------------- */
/*  Per-client compendium actor cache           */
/* -------------------------------------------- */

const cache = new Map<string, Actor.Implementation>();
const pending = new Map<string, Promise<Actor.Implementation | null>>();

/** The cached compendium actor for a UUID (synchronous — for `baseActor`). */
export function cachedCompendiumActor(uuid: string): Actor.Implementation | null {
    return cache.get(uuid) ?? null;
}

/** Seed the cache with a compendium actor already in hand (the drop path). */
function remember(uuid: string, actor: Actor.Implementation): void {
    cache.set(uuid, actor);
}

/** Resolve a UUID to a compendium actor, or null when it is not an Actor. */
async function fetchCompendiumActor(uuid: string): Promise<Actor.Implementation | null> {
    const doc = await fromUuid<Actor.Implementation>(uuid);
    return doc?.documentName === 'Actor' ? doc : null;
}

/** Load (once) and cache a compendium actor by UUID. */
async function loadCompendiumActor(uuid: string): Promise<Actor.Implementation | null> {
    const hit = cache.get(uuid);
    if (hit !== undefined) return hit;
    const inFlight = pending.get(uuid);
    if (inFlight !== undefined) return inFlight;
    const promise = fetchCompendiumActor(uuid).then((actor) => {
        if (actor !== null) cache.set(uuid, actor);
        pending.delete(uuid);
        return actor;
    });
    pending.set(uuid, promise);
    return promise;
}

/** The slice of a placed token document the rebuild touches. */
interface CompendiumBackedToken {
    // eslint-disable-next-line no-restricted-syntax -- boundary: mirrors TokenDocument#getFlag, whose return is untyped; read only through compendiumActorUuidOf
    getFlag: (scope: typeof SYSTEM_ID, key: string) => unknown;
    actorLink: boolean;
    /** True while the ActorDelta has not been materialised yet (core getter). */
    isLazyDelta?: boolean;
    reset: () => void;
}

/** The ActorDelta internals the rebuild calls (core `ActorDelta#_createSyntheticActor`, @internal). */
interface RebuildableDelta {
    _createSyntheticActor: (options: { reinitializeCollections: boolean }) => void;
}

/** Is this an ActorDelta exposing the synthetic-actor rebuild? */
function isRebuildableDelta(value: object | null): value is RebuildableDelta {
    return value !== null && '_createSyntheticActor' in value && typeof value._createSyntheticActor === 'function';
}

/** Does this token carry an ActorDelta that can rebuild its synthetic actor? */
function rebuildableDelta(token: object): RebuildableDelta | null {
    if (!('delta' in token)) return null;
    const delta = token.delta;
    return typeof delta === 'object' && isRebuildableDelta(delta) ? delta : null;
}

/** A placeable's render-flag set (core `RenderFlags#set`). */
interface RedrawFlags {
    set: (flags: { redraw: boolean }) => void;
}

/** Is this a render-flag set we can ask to redraw? */
function isRedrawFlags(value: object | null): value is RedrawFlags {
    return value !== null && 'set' in value && typeof value.set === 'function';
}

/** Ask a token's placeable (if drawn) to redraw. */
function redrawPlaceable(token: object): void {
    if (!('object' in token)) return;
    const placeable = token.object;
    if (typeof placeable !== 'object' || placeable === null || !('renderFlags' in placeable)) return;
    const flags = placeable.renderFlags;
    if (typeof flags === 'object' && isRedrawFlags(flags)) flags.set({ redraw: true });
}

/**
 * Load a token's compendium actor and, if its synthetic actor was already built
 * without a base (materialised before the cache held it), rebuild it and redraw
 * the token. A no-op for ordinary tokens.
 */
export async function ensureCompendiumTokenActor(token: CompendiumBackedToken): Promise<void> {
    const uuid = compendiumActorUuidOf(token);
    if (uuid === null || token.actorLink) return;
    const wasCached = cachedCompendiumActor(uuid) !== null;
    const actor = await loadCompendiumActor(uuid);
    if (actor === null || wasCached || token.isLazyDelta === true) return;
    rebuildableDelta(token)?._createSyntheticActor({ reinitializeCollections: true });
    token.reset();
    redrawPlaceable(token);
}

/** Load the compendium actors behind every flagged token in the world (world setup). */
export async function preloadCompendiumTokenActors(scenes: Iterable<{ tokens: Iterable<CompendiumBackedToken> }>): Promise<void> {
    const work: Array<Promise<void>> = [];
    for (const scene of scenes) {
        for (const token of scene.tokens) {
            if (compendiumActorUuidOf(token) !== null) work.push(ensureCompendiumTokenActor(token));
        }
    }
    await Promise.all(work);
}

/* -------------------------------------------- */
/*  Drop                                        */
/* -------------------------------------------- */

/** Drag data for an actor dropped on the canvas (with canvas coordinates). */
export interface ActorCanvasDrop {
    type: string;
    uuid: string;
    x: number;
    y: number;
    elevation?: number;
}

/**
 * Place a compendium actor as a token-only, compendium-backed unlinked token —
 * the `TokenLayer#_onDropActorData` flow minus the world-actor import.
 */
export async function placeCompendiumToken(data: ActorCanvasDrop, event: DragEvent): Promise<void> {
    if (!game.user.can('TOKEN_CREATE')) return;
    const { scene, dimensions, tokens: layer } = canvas;
    if (scene === null || dimensions === null || layer === undefined || !dimensions.rect.contains(data.x, data.y)) return;

    const actor = await loadCompendiumActor(data.uuid);
    if (actor === null) return;
    if (!actor.isOwner) {
        ui.notifications.warn(t('WH40K.Token.CompendiumDropNoPermission'));
        return;
    }
    remember(data.uuid, actor);

    // The token's delta OWNS a copy of every embedded item/effect. The server has
    // no base actor for a compendium-backed token (it resolves `actorId` against
    // world actors only), and updating a base-only embedded document through the
    // delta needs the base collection — so ammo, equip or quantity edits would
    // fail. Seeded here, every embedded edit lands on a delta-managed document.
    const source = actor.toObject();
    const token = await actor.getTokenDocument(
        {
            actorLink: false,
            hidden: game.user.isGM && event.altKey,
            sort: Math.max(layer.getMaxSort() + 1, 0),
            flags: { [SYSTEM_ID]: { [COMPENDIUM_ACTOR_FLAG]: data.uuid } },
            delta: { type: source.type, items: source.items, effects: source.effects },
        },
        { parent: scene },
    );
    const position = foundry.canvas.placeables.Token._getDropActorPosition(
        token,
        { x: data.x, y: data.y, elevation: data.elevation },
        { snap: !event.shiftKey },
    );
    token.updateSource(position);
    layer.activate();
    await TokenDocument.implementation.create(token.toObject(), { parent: scene });
}
