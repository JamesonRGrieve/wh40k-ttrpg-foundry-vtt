import { describe, expect, it } from 'vitest';
import type { PortraitVariant, TokenFrame } from './portrait-pool.ts';
import {
    applyPortraitOnPreCreate,
    applySpawnPortrait,
    decideSpawnPortrait,
    type PortraitActorLike,
    type PortraitUpdate,
    rerollSpawnPortrait,
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
});

describe('applySpawnPortrait', () => {
    it('writes img and the token-bust frame flag to the pending source', () => {
        const actor = mockActor();
        applySpawnPortrait(actor, { img: 'chosen.webp', tokenFrame: { cx: 0.5, cy: 0.28 } });
        expect(actor.updates).toHaveLength(1);
        expect(actor.updates[0]).toEqual({
            img: 'chosen.webp',
            prototypeToken: { flags: { [SYSTEM_ID]: { tokenFrame: { cx: 0.5, cy: 0.28 } } } },
        });
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
