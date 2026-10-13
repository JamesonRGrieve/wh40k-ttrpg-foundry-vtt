import { describe, expect, it } from 'vitest';
import { DEFAULT_TOKEN_FOOTPRINT, withCompleteTokenFootprint } from '../scripts/lib/pack-prototype-token.cjs';

/**
 * Foundry's server migration (core 14.353) sets `prototypeToken.depth` to
 * `Math.min(width, height)` on every pack record lacking `_stats.coreVersion`.
 * A partial token has no width/height, so that is NaN and the server logs
 * `prototypeToken: depth: must be a number` (#602).
 */
function migratedDepth(token: object): number {
    const { width, height }: { width?: number; height?: number } = token;
    return Math.min(width as number, height as number);
}

describe('withCompleteTokenFootprint (#602)', () => {
    it('reproduces the defect: the server migration yields NaN depth for a partial token', () => {
        expect(migratedDepth({})).toBeNaN();
    });

    it('gives a partial token the footprint the migration needs, keeping authored fields', () => {
        const doc = { _id: 'a', prototypeToken: { texture: { src: 'x.webp' }, ring: { enabled: true } } };
        const out = withCompleteTokenFootprint(doc);
        expect(out.prototypeToken).toEqual({ texture: { src: 'x.webp' }, ring: { enabled: true }, ...DEFAULT_TOKEN_FOOTPRINT });
        expect(Number.isNaN(migratedDepth(out.prototypeToken))).toBe(false);
    });

    it('keeps an authored footprint and fills only what is missing', () => {
        const out = withCompleteTokenFootprint({ prototypeToken: { width: 3, height: 3 } });
        expect(out.prototypeToken).toEqual({ width: 3, height: 3, depth: 1 });
    });

    it('does not mutate the source document', () => {
        const doc = { prototypeToken: { texture: { src: 'x.webp' } } };
        withCompleteTokenFootprint(doc);
        expect(doc.prototypeToken).toEqual({ texture: { src: 'x.webp' } });
    });

    it('returns a document without a token, or already complete, unchanged', () => {
        const bare = { _id: 'b' };
        expect(withCompleteTokenFootprint(bare)).toBe(bare);
        const full = { prototypeToken: { ...DEFAULT_TOKEN_FOOTPRINT } };
        expect(withCompleteTokenFootprint(full)).toBe(full);
    });
});
