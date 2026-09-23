import { describe, expect, it } from 'vitest';
import type { PortraitVariant, TokenFrame } from './portrait-pool.ts';
import {
    applyPortraitOnPreCreate,
    applyPortraitOnPreCreateToken,
    applySpawnPortrait,
    collectUsedPortraitImgs,
    currentPortraitIndex,
    decideSpawnPortrait,
    effectivePoolSize,
    type PortraitActorLike,
    type PortraitTokenLike,
    type PortraitUpdate,
    type TokenPortraitUpdate,
    rerollSpawnPortrait,
    togglePinnedIndex,
} from './portrait-spawn.ts';

const SYSTEM_ID = 'wh40k-rpg';

interface MockActor extends PortraitActorLike {
    updates: PortraitUpdate[];
}

function mockActor(opts: { img?: string | null; variants?: PortraitVariant[]; pinned?: number | null; frame?: TokenFrame | null } = {}): MockActor {
    const updates: PortraitUpdate[] = [];
    return {
        img: opts.img ?? 'default.webp',
        system: { portraits: { variants: opts.variants ?? [], pinned: opts.pinned ?? null } },
        prototypeToken: { flags: { [SYSTEM_ID]: { tokenFrame: opts.frame ?? { cx: 0.5, cy: 0.3 } } } },
        updates,
        updateSource(changes: PortraitUpdate) {
            updates.push(changes);
        },
    };
}

function rngOf(...values: number[]): () => number {
    let i = 0;
    return () => values[Math.min(i++, values.length - 1)] ?? 0;
}

describe('decideSpawnPortrait', () => {
    it('returns null when the actor has no extra variants', () => {
        expect(decideSpawnPortrait(mockActor(), rngOf(0.9))).toBeNull();
    });

    it('picks a random variant (default at index 0, variants after)', () => {
        const actor = mockActor({ variants: [{ img: 'b.webp', tokenFrame: { cx: 0.4, cy: 0.25 } }] });
        // pool = [default.webp, b.webp]; rng 0.9 → last.
        expect(decideSpawnPortrait(actor, rngOf(0.9))?.img).toBe('b.webp');
        // rng 0 → the default.
        expect(decideSpawnPortrait(actor, rngOf(0))?.img).toBe('default.webp');
    });

    it("carries the default portrait's prototype-token frame at index 0", () => {
        const actor = mockActor({ frame: { cx: 0.5, cy: 0.3 }, variants: [{ img: 'b.webp', tokenFrame: null }] });
        expect(decideSpawnPortrait(actor, rngOf(0))?.tokenFrame).toEqual({ cx: 0.5, cy: 0.3 });
    });

    it('carries the frame zoom onto the chosen default portrait', () => {
        const actor = mockActor({ frame: { cx: 0.5, cy: 0.3, zoom: 1.67 }, variants: [{ img: 'b.webp', tokenFrame: null }] });
        expect(decideSpawnPortrait(actor, rngOf(0))?.tokenFrame).toEqual({ cx: 0.5, cy: 0.3, zoom: 1.67 });
    });

    it('honours a pinned index and ignores the RNG', () => {
        const actor = mockActor({
            variants: [
                { img: 'b.webp', tokenFrame: null },
                { img: 'c.webp', tokenFrame: null },
            ],
            pinned: 2,
        });
        expect(decideSpawnPortrait(actor, rngOf(0))?.img).toBe('c.webp');
    });

    it('avoids a portrait already used in the world (#567 no-duplicate)', () => {
        const actor = mockActor({
            variants: [
                { img: 'b.webp', tokenFrame: null },
                { img: 'c.webp', tokenFrame: null },
            ],
        });
        // pool = [default.webp, b.webp, c.webp]; default + b taken → only c left,
        // so rng 0 (which would otherwise pick the default) yields c.
        const used = new Set(['default.webp', 'b.webp']);
        expect(decideSpawnPortrait(actor, rngOf(0), used)?.img).toBe('c.webp');
    });

    it('repeats only once every world portrait is exhausted', () => {
        const actor = mockActor({ variants: [{ img: 'b.webp', tokenFrame: null }] });
        const used = new Set(['default.webp', 'b.webp']);
        // Both taken → fall back to the full pool; rng 0 → the default.
        expect(decideSpawnPortrait(actor, rngOf(0), used)?.img).toBe('default.webp');
    });
});

describe('collectUsedPortraitImgs', () => {
    it('collects non-blank img refs and dedupes', () => {
        const used = collectUsedPortraitImgs([{ img: 'a.webp' }, { img: 'b.webp' }, { img: 'a.webp' }]);
        expect([...used].sort()).toEqual(['a.webp', 'b.webp']);
    });

    it('skips blank, whitespace, and missing img', () => {
        const used = collectUsedPortraitImgs([{ img: '' }, { img: '   ' }, { img: null }, {}, { img: 'real.webp' }]);
        expect([...used]).toEqual(['real.webp']);
    });
});

describe('applySpawnPortrait', () => {
    it('writes img and the token-bust frame flag to the pending source', () => {
        const actor = mockActor();
        applySpawnPortrait(actor, { img: 'chosen.webp', tokenFrame: { cx: 0.5, cy: 0.28 } });
        expect(actor.updates).toHaveLength(1);
        expect(actor.updates[0]).toEqual({
            img: 'chosen.webp',
            prototypeToken: {
                flags: { [SYSTEM_ID]: { tokenFrame: { cx: 0.5, cy: 0.28 } } },
                ring: { subject: { scale: 0.8 } },
            },
        });
    });
});

describe('applyPortraitOnPreCreateToken', () => {
    interface MockToken extends PortraitTokenLike {
        updates: TokenPortraitUpdate[];
    }
    function mockToken(actorLink = false): MockToken {
        const updates: TokenPortraitUpdate[] = [];
        return {
            actorLink,
            updates,
            updateSource(changes: TokenPortraitUpdate) {
                updates.push(changes);
            },
        };
    }

    it('rolls a per-token portrait (src + frame + 0.8 ring scale) for an unlinked pooled token', () => {
        const token = mockToken(false);
        const actor = mockActor({ variants: [{ img: 'b.webp', tokenFrame: { cx: 0.4, cy: 0.25 } }] });
        applyPortraitOnPreCreateToken(token, actor, rngOf(0.9));
        expect(token.updates).toHaveLength(1);
        expect(token.updates[0]?.texture.src).toBe('b.webp');
        expect(token.updates[0]?.ring.subject.scale).toBe(0.8);
        expect(token.updates[0]?.flags[SYSTEM_ID]?.tokenFrame).toEqual({ cx: 0.4, cy: 0.25 });
    });

    it('no-ops for a LINKED token (it mirrors its actor)', () => {
        const token = mockToken(true);
        applyPortraitOnPreCreateToken(token, mockActor({ variants: [{ img: 'b.webp', tokenFrame: null }] }), rngOf(0.9));
        expect(token.updates).toHaveLength(0);
    });

    it('no-ops when the actor has no pool', () => {
        const token = mockToken(false);
        applyPortraitOnPreCreateToken(token, mockActor(), rngOf(0.9));
        expect(token.updates).toHaveLength(0);
    });

    it('avoids a portrait already used by a sibling token on the scene', () => {
        const token = mockToken(false);
        const actor = mockActor({ img: 'a.webp', variants: [{ img: 'b.webp', tokenFrame: null }] });
        applyPortraitOnPreCreateToken(token, actor, rngOf(0), new Set(['a.webp']));
        expect(token.updates[0]?.texture.src).toBe('b.webp');
    });
});

describe('applyPortraitOnPreCreate', () => {
    it('no-ops for an actor with no extra variants', () => {
        const actor = mockActor();
        applyPortraitOnPreCreate(actor, rngOf(0.9));
        expect(actor.updates).toHaveLength(0);
    });

    it('applies a chosen portrait when a pool exists', () => {
        const actor = mockActor({ variants: [{ img: 'b.webp', tokenFrame: { cx: 0.4, cy: 0.25 } }] });
        applyPortraitOnPreCreate(actor, rngOf(0.9));
        expect(actor.updates).toHaveLength(1);
        expect(actor.updates[0]?.img).toBe('b.webp');
    });
});

describe('rerollSpawnPortrait', () => {
    it('ignores the pin and re-picks at random', () => {
        const actor = mockActor({ variants: [{ img: 'b.webp', tokenFrame: null }], pinned: 0 });
        // Pinned to the default, but a re-roll ignores it: rng 0.9 → last (b.webp).
        expect(rerollSpawnPortrait(actor, rngOf(0.9))?.img).toBe('b.webp');
    });

    it('returns null when there is nothing to re-roll', () => {
        expect(rerollSpawnPortrait(mockActor(), rngOf(0.9))).toBeNull();
    });
});

// The sheet-control helpers (#567): drive the "has a pool" gate, resolve the
// current portrait's pool index, and toggle the pin on the current portrait.
describe('effectivePoolSize', () => {
    it('counts the default portrait alone as a pool of one', () => {
        expect(effectivePoolSize(mockActor())).toBe(1);
    });

    it('counts the default plus its authored variants', () => {
        expect(
            effectivePoolSize(
                mockActor({
                    variants: [
                        { img: 'b.webp', tokenFrame: null },
                        { img: 'c.webp', tokenFrame: null },
                    ],
                }),
            ),
        ).toBe(3);
    });

    it('drops a blank default so only real images count', () => {
        expect(effectivePoolSize(mockActor({ img: '  ', variants: [{ img: 'b.webp', tokenFrame: null }] }))).toBe(1);
    });
});

describe('currentPortraitIndex', () => {
    it('finds the current img at its pool position (default is index 0)', () => {
        expect(currentPortraitIndex(mockActor({ variants: [{ img: 'b.webp', tokenFrame: null }] }))).toBe(0);
    });

    it('finds a variant that is the current img', () => {
        const actor = mockActor({
            img: 'b.webp',
            variants: [
                { img: 'a.webp', tokenFrame: null },
                { img: 'b.webp', tokenFrame: null },
            ],
        });
        // Pool = [b.webp (default), a.webp, b.webp]; the current img matches index 0.
        expect(currentPortraitIndex(actor)).toBe(0);
    });

    it('returns null when the current img is not in the pool', () => {
        const actor = mockActor({ img: 'hand-set.webp', variants: [] });
        // Pool = [hand-set.webp] — actually index 0; force a genuine miss instead:
        const missing = mockActor({ img: '  ', variants: [{ img: 'b.webp', tokenFrame: null }] });
        expect(currentPortraitIndex(actor)).toBe(0);
        expect(currentPortraitIndex(missing)).toBeNull();
    });
});

describe('togglePinnedIndex', () => {
    it('pins to the current portrait index when not already pinned', () => {
        const actor = mockActor({ variants: [{ img: 'b.webp', tokenFrame: null }] });
        expect(togglePinnedIndex(actor)).toBe(0);
    });

    it('unpins (null) when a pin is already set', () => {
        const actor = mockActor({ variants: [{ img: 'b.webp', tokenFrame: null }], pinned: 1 });
        expect(togglePinnedIndex(actor)).toBeNull();
    });

    it('returns undefined (no-op) when the current img is not in the pool', () => {
        const actor = mockActor({ img: '  ', variants: [{ img: 'b.webp', tokenFrame: null }] });
        expect(togglePinnedIndex(actor)).toBeUndefined();
    });
});
