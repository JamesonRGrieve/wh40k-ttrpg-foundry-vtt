/**
 * Portrait-pool selection for actor spawning (#567).
 *
 * A compendium actor may carry several portraits (`system.portraits.variants`)
 * beyond its default `img`. When such an actor is spawned — imported to the
 * world, or dropped onto the canvas — one portrait is chosen (at random, or the
 * pinned one) and stamped onto the created actor's `img` and its token bust
 * frame. Because this system crops the circular token bust from the portrait at
 * draw time (`prototypeToken.flags.wh40k-rpg.tokenFrame`), each variant carries
 * its OWN frame so the bust is cropped correctly for whichever portrait is
 * picked.
 *
 * This module is the pure, content-agnostic selection logic. The RNG is injected
 * so stories/tests are deterministic; runtime defaults to `Math.random`.
 */

/**
 * The circular token-bust frame for a portrait — the subset of the system's
 * `flags.wh40k-rpg.tokenFrame` shape a pool variant needs to carry so its bust
 * crops correctly: the source-fraction centre (`cx`/`cy`) and the subject `zoom`.
 */
export interface TokenFrame {
    cx: number | null;
    cy: number | null;
    /** Subject zoom for the bust crop (source scaled by content × zoom); default 1. */
    zoom?: number | null;
}

/** One portrait choice: an image and the frame its bust crops from. */
export interface PortraitVariant {
    img: string;
    tokenFrame: TokenFrame | null;
}

/**
 * The effective pool for an actor: its default portrait at index 0 (the actor's
 * own `img` + prototype-token frame), followed by the extra authored variants.
 * A blank/absent default is dropped so a pool of only real images remains.
 */
export function effectivePortraitPool(defaultVariant: PortraitVariant | null, variants: readonly PortraitVariant[] | null | undefined): PortraitVariant[] {
    const pool: PortraitVariant[] = [];
    if (defaultVariant !== null && defaultVariant.img.trim() !== '') pool.push(defaultVariant);
    for (const v of variants ?? []) {
        if (typeof v.img === 'string' && v.img.trim() !== '') pool.push({ img: v.img, tokenFrame: v.tokenFrame ?? null });
    }
    return pool;
}

/**
 * Choose a portrait from the effective pool, preferring one not already in use
 * by entities placed in the world (#567 — sample without replacement across the
 * placed set, so a crowd of the same statblock stays visually varied).
 *
 * - A valid `pinned` index always wins (spawn stops rolling); a GM's explicit
 *   pin is never dodged for the sake of variety.
 * - Otherwise, with two or more entries, one is chosen uniformly at random from
 *   the pool variants whose image is NOT in `usedImgs`.
 * - Only once every variant is taken (the pool is **exhausted**) does it fall
 *   back to the full pool and allow a repeat.
 * - Returns `null` when there is nothing to change (empty pool, or a single
 *   entry with no pin) so the caller can skip the write.
 *
 * @param pool     effective pool from {@link effectivePortraitPool}.
 * @param pinned   pinned index (0-based) or null for random.
 * @param usedImgs image refs already used by entities in the world.
 * @param rng      injected RNG in [0, 1); defaults to Math.random for runtime.
 */
/** Shared empty used-set for the no-dedup path (avoids per-call allocation). */
const EMPTY_USED: ReadonlySet<string> = new Set<string>();

export function choosePortraitAvoiding(
    pool: readonly PortraitVariant[],
    pinned: number | null,
    usedImgs: ReadonlySet<string>,
    rng: () => number = Math.random,
): PortraitVariant | null {
    if (pool.length === 0) return null;
    if (pinned !== null && Number.isInteger(pinned) && pinned >= 0 && pinned < pool.length) {
        return pool[pinned] ?? null;
    }
    if (pool.length <= 1) return null;
    // Prefer variants not already placed; only repeat once all are exhausted.
    const available = usedImgs.size === 0 ? pool : pool.filter((p) => !usedImgs.has(p.img));
    const choices = available.length > 0 ? available : pool;
    const idx = Math.min(choices.length - 1, Math.max(0, Math.floor(rng() * choices.length)));
    return choices[idx] ?? null;
}

/**
 * Choose a portrait from the effective pool with no world-dedup — the plain
 * random/pinned pick. Thin wrapper over {@link choosePortraitAvoiding} with an
 * empty used-set (used by the manual GM re-roll, which varies against nothing).
 *
 * @param pool   effective pool from {@link effectivePortraitPool}.
 * @param pinned pinned index (0-based) or null for random.
 * @param rng    injected RNG in [0, 1); defaults to Math.random for runtime.
 */
export function choosePortrait(pool: readonly PortraitVariant[], pinned: number | null, rng: () => number = Math.random): PortraitVariant | null {
    return choosePortraitAvoiding(pool, pinned, EMPTY_USED, rng);
}
