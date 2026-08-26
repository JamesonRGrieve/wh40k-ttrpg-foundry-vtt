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
 * runtime default is `Math.random`. Per-unlinked-token variance (a different
 * portrait per token in a placed mob) is a separate surface — see #567.
 */

import { SYSTEM_ID } from '../constants.ts';
import { choosePortrait, effectivePortraitPool, type PortraitVariant, type TokenFrame } from './portrait-pool.ts';

/** The pending-source update {@link applySpawnPortrait} writes on spawn. */
export interface PortraitUpdate {
    img: string;
    prototypeToken: { flags: { [scope: string]: { tokenFrame: TokenFrame | null } } };
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
    return { cx: typeof raw.cx === 'number' ? raw.cx : null, cy: typeof raw.cy === 'number' ? raw.cy : null };
}

/** The actor's default portrait (pool index 0): its own img + prototype frame. */
function defaultVariant(actor: PortraitActorLike): PortraitVariant | null {
    const img = typeof actor.img === 'string' ? actor.img : '';
    if (img.trim() === '') return null;
    return { img, tokenFrame: readPrototypeTokenFrame(actor) };
}

/**
 * Decide which portrait a spawning actor should use, or `null` to leave it
 * unchanged. Pure — the RNG is injected for deterministic tests.
 */
export function decideSpawnPortrait(actor: PortraitActorLike, rng: () => number = Math.random): PortraitVariant | null {
    const portraits = actor.system?.portraits ?? null;
    const pool = effectivePortraitPool(defaultVariant(actor), portraits?.variants ?? null);
    return choosePortrait(pool, portraits?.pinned ?? null, rng);
}

/** Stamp a chosen portrait onto a pending actor source (img + bust frame). */
export function applySpawnPortrait(actor: PortraitActorLike, chosen: PortraitVariant): void {
    actor.updateSource({
        img: chosen.img,
        prototypeToken: { flags: { [SYSTEM_ID]: { tokenFrame: chosen.tokenFrame } } },
    });
}

/** `preCreateActor` handler: choose and apply a portrait, or no-op. */
export function applyPortraitOnPreCreate(actor: PortraitActorLike, rng: () => number = Math.random): void {
    const chosen = decideSpawnPortrait(actor, rng);
    if (chosen === null) return;
    applySpawnPortrait(actor, chosen);
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
