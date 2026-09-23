/**
 * Apply the portrait pool (#567) when an actor is spawned into the world.
 *
 * On `preCreateActor` — importing a compendium actor to the world, or dropping
 * one onto the canvas as a linked world actor — a portrait is chosen from the
 * actor's pool (its default `img` plus `system.portraits.variants`) and stamped
 * onto the pending source: the actor's `img` and its prototype-token bust frame
 * (`prototypeToken.flags.wh40k-rpg.tokenFrame`), so the circular token bust
 * crops correctly for whichever portrait was picked. `system.portraits.pinned`
 * forces a specific index and disables the roll.
 *
 * The decision is a pure, RNG-injected function so it is fully testable; the
 * runtime default is `Math.random`. Per-unlinked-token variance — a different
 * portrait per token in a placed mob — is handled by
 * {@link applyPortraitOnPreCreateToken} on the `preCreateToken` hook (#567), so a
 * squad dropped from one pooled actor gets a distinct face per token.
 */

import { SYSTEM_ID } from '../constants.ts';
import { choosePortrait, choosePortraitAvoiding, effectivePortraitPool, type PortraitVariant, type TokenFrame } from './portrait-pool.ts';

/** No portraits taken — the default when spawn dedup is not in play. */
const NO_USED_IMGS: ReadonlySet<string> = new Set<string>();

/**
 * Ring subject scale that seats the generated circular bust inside the ring band,
 * matching player-character tokens. It applies on a fresh draw (not the
 * animation path), so a spawned bust is sized like the party's instead of
 * overflowing the ring.
 */
const DEFAULT_RING_SUBJECT_SCALE = 0.8;

/** The pending-source update {@link applySpawnPortrait} writes on spawn. */
export interface PortraitUpdate {
    img: string;
    prototypeToken: { flags: { [scope: string]: { tokenFrame: TokenFrame | null } }; ring: { subject: { scale: number } } };
}

/** The narrow slice of an Actor (document or pending source) this logic touches. */
export interface PortraitActorLike {
    img?: string | null;
    system?: { portraits?: { variants?: readonly PortraitVariant[] | null; pinned?: number | null } | null } | null;
    prototypeToken?: { flags?: { [scope: string]: { tokenFrame?: TokenFrame | null } | undefined } | null } | null;
    updateSource: (changes: PortraitUpdate) => void;
}

/** Read the prototype-token bust frame flag from the actor's flags data. */
function readPrototypeTokenFrame(actor: PortraitActorLike): TokenFrame | null {
    const raw = actor.prototypeToken?.flags?.[SYSTEM_ID]?.tokenFrame;
    if (raw === null || raw === undefined) return null;
    const frame: TokenFrame = { cx: typeof raw.cx === 'number' ? raw.cx : null, cy: typeof raw.cy === 'number' ? raw.cy : null };
    if (typeof raw.zoom === 'number') frame.zoom = raw.zoom;
    return frame;
}

/** The actor's default portrait (pool index 0): its own img + prototype frame. */
function defaultVariant(actor: PortraitActorLike): PortraitVariant | null {
    const img = typeof actor.img === 'string' ? actor.img : '';
    if (img.trim() === '') return null;
    return { img, tokenFrame: readPrototypeTokenFrame(actor) };
}

/**
 * Collect the portrait images already used by entities in the world (#567), so a
 * fresh spawn can avoid repeating one until the pool is exhausted. Pure over the
 * iterable of actor-likes; the caller supplies `game.actors` at runtime.
 */
export function collectUsedPortraitImgs(actors: Iterable<{ img?: string | null }>): Set<string> {
    const used = new Set<string>();
    for (const a of actors) {
        if (typeof a.img === 'string' && a.img.trim() !== '') used.add(a.img);
    }
    return used;
}

/**
 * Decide which portrait a spawning actor should use, or `null` to leave it
 * unchanged. Pure — the RNG is injected for deterministic tests. `usedImgs`
 * (images already placed in the world) is avoided until the pool is exhausted.
 */
export function decideSpawnPortrait(
    actor: PortraitActorLike,
    rng: () => number = Math.random,
    usedImgs: ReadonlySet<string> = NO_USED_IMGS,
): PortraitVariant | null {
    const portraits = actor.system?.portraits ?? null;
    const pool = effectivePortraitPool(defaultVariant(actor), portraits?.variants ?? null);
    return choosePortraitAvoiding(pool, portraits?.pinned ?? null, usedImgs, rng);
}

/** Stamp a chosen portrait onto a pending actor source (img + bust frame + ring scale). */
export function applySpawnPortrait(actor: PortraitActorLike, chosen: PortraitVariant): void {
    actor.updateSource({
        img: chosen.img,
        prototypeToken: {
            flags: { [SYSTEM_ID]: { tokenFrame: chosen.tokenFrame } },
            ring: { subject: { scale: DEFAULT_RING_SUBJECT_SCALE } },
        },
    });
}

/**
 * `preCreateActor` handler: choose and apply a portrait, or no-op. `usedImgs`
 * (portraits already placed in the world) is avoided until the pool is exhausted.
 */
export function applyPortraitOnPreCreate(actor: PortraitActorLike, rng: () => number = Math.random, usedImgs: ReadonlySet<string> = NO_USED_IMGS): void {
    const chosen = decideSpawnPortrait(actor, rng, usedImgs);
    if (chosen === null) return;
    applySpawnPortrait(actor, chosen);
}

/** The pending-token-source update {@link applyPortraitOnPreCreateToken} writes. */
export interface TokenPortraitUpdate {
    texture: { src: string };
    ring: { subject: { scale: number } };
    flags: { [scope: string]: { tokenFrame: TokenFrame | null } };
}

/** The narrow slice of a Token document (pending source) the per-token roll touches. */
export interface PortraitTokenLike {
    actorLink?: boolean | null;
    updateSource: (changes: TokenPortraitUpdate) => void;
}

/**
 * `preCreateToken` handler: give an UNLINKED token of a pooled actor its own
 * random portrait (+ bust frame + ring subject scale), so each token in a placed
 * mob varies instead of all sharing the actor's single image (#567). No-op for a
 * LINKED token (it mirrors its actor's sheet image) or an actor with no pool.
 * `usedImgs` are the portraits already on sibling tokens of the same actor on the
 * scene, avoided until the pool is exhausted. Pure; the RNG is injected for tests.
 */
export function applyPortraitOnPreCreateToken(
    token: PortraitTokenLike,
    poolActor: PortraitActorLike | null,
    rng: () => number = Math.random,
    usedImgs: ReadonlySet<string> = NO_USED_IMGS,
): void {
    if (token.actorLink === true) return;
    if (poolActor === null) return;
    const chosen = decideSpawnPortrait(poolActor, rng, usedImgs);
    if (chosen === null) return;
    token.updateSource({
        texture: { src: chosen.img },
        ring: { subject: { scale: DEFAULT_RING_SUBJECT_SCALE } },
        flags: { [SYSTEM_ID]: { tokenFrame: chosen.tokenFrame } },
    });
}

/**
 * A fresh random portrait for a manual GM re-roll — ignores any `pinned` index
 * and picks uniformly from the effective pool. Returns `null` when the pool has
 * fewer than two entries (nothing to re-roll).
 */
export function rerollSpawnPortrait(actor: PortraitActorLike, rng: () => number = Math.random): PortraitVariant | null {
    const pool = effectivePortraitPool(defaultVariant(actor), actor.system?.portraits?.variants ?? null);
    return choosePortrait(pool, null, rng);
}

/**
 * The size of the actor's effective portrait pool (default `img` + variants).
 * Drives the sheet's "this actor has a pool to re-roll / pin" UI gate — the
 * control only makes sense at two or more.
 */
export function effectivePoolSize(actor: PortraitActorLike): number {
    return effectivePortraitPool(defaultVariant(actor), actor.system?.portraits?.variants ?? null).length;
}

/**
 * The index of the actor's current `img` within its effective pool, or `null`
 * when the current image is not in the pool (e.g. a hand-set portrait). Used to
 * pin the pool to whatever portrait is showing now.
 */
export function currentPortraitIndex(actor: PortraitActorLike): number | null {
    const pool = effectivePortraitPool(defaultVariant(actor), actor.system?.portraits?.variants ?? null);
    const img = typeof actor.img === 'string' ? actor.img : '';
    const idx = pool.findIndex((p) => p.img === img);
    return idx >= 0 ? idx : null;
}

/**
 * The `system.portraits.pinned` value after toggling the pin on the CURRENT
 * portrait: `null` (unpin — resume the random roll) when a pin is already set,
 * otherwise the current portrait's pool index (pin spawn to what is showing).
 * Returns `undefined` when there is nothing to pin (the current image is not in
 * the pool) so the caller can no-op rather than write a meaningless pin.
 */
export function togglePinnedIndex(actor: PortraitActorLike): number | null | undefined {
    const pinned = actor.system?.portraits?.pinned ?? null;
    if (pinned !== null) return null; // already pinned → unpin
    // `null` (not found) → undefined (no-op); a real index, 0 included, is kept.
    const idx = currentPortraitIndex(actor);
    return idx ?? undefined;
}
