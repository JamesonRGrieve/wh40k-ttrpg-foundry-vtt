import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    inferActiveGameLine,
    isLineVariantContainer,
    materializeItemVariants,
    normalizeGameLineKey,
    rawProvenanceLines,
    resolveLineVariant,
} from './item-variant-utils.ts';

describe('resolveLineVariant', () => {
    it('returns plain values unchanged', () => {
        expect(resolveLineVariant('1d10', 'dh2')).toBe('1d10');
    });

    it('resolves the active line branch', () => {
        expect(resolveLineVariant({ dh1: 'a', dh2: 'b' }, 'dh2')).toBe('b');
    });

    it('falls back to the first defined line when the active line is absent', () => {
        expect(resolveLineVariant({ dh1: 'a', rt: 'c' }, 'dh2')).toBe('a');
    });

    it('resolves a book-variant container to its canonical book', () => {
        const value = { __canonical: 'core', __books: { 'core': '1d10+3', 'enemies-within': '1d10+4' } };
        expect(resolveLineVariant(value, 'dh2')).toBe('1d10+3');
    });

    it('falls back to the first book when canonical is missing', () => {
        const value = { __books: { 'enemies-within': '1d10+4', 'core': '1d10+3' } };
        expect(resolveLineVariant(value, 'dh2')).toBe('1d10+4');
    });

    it('resolves a book-variant nested inside the active line branch', () => {
        const value = { dh2: { __canonical: 'ew', __books: { core: 'x', ew: 'y' } }, dh1: 'z' };
        expect(resolveLineVariant(value, 'dh2')).toBe('y');
    });

    it('falls back to the raw-provenance line, not id order, when the active line is absent', () => {
        // ow is the raw line; dh2 is a homebrew conversion branch. An unauthored
        // line (rt) must inherit the RAW (ow) stats, never the dh2 homebrew branch.
        const grants = { ow: 'official', dh2: 'homebrew-conversion' };
        expect(resolveLineVariant(grants, 'rt', ['ow'])).toBe('official');
        // The active line that owns a branch still gets its own.
        expect(resolveLineVariant(grants, 'dh2', ['ow'])).toBe('homebrew-conversion');
        // Without a raw-line hint, behaviour reverts to first-defined (id order).
        expect(resolveLineVariant(grants, 'rt')).toBe('homebrew-conversion');
    });
});

describe('rawProvenanceLines', () => {
    it('lists only lines whose source provenance is raw, in id order', () => {
        const system = {
            source: {
                ow: { provenance: 'raw' },
                rt: { provenance: 'raw' },
                dh2: { provenance: 'homebrew' },
            },
        };
        expect(rawProvenanceLines(system)).toEqual(['rt', 'ow']);
    });

    it('returns an empty list when there is no source map', () => {
        expect(rawProvenanceLines({})).toEqual([]);
    });
});

describe('materializeItemVariants — raw-provenance fallback', () => {
    it('collapses a homebrew dh2 conversion without leaking it onto sibling lines', () => {
        const make = (): { source: Record<string, { provenance: string }>; grants: Record<string, string> } => ({
            source: { ow: { provenance: 'raw' }, dh2: { provenance: 'homebrew' } },
            grants: { ow: 'OW-STATS', dh2: 'DH2-HOMEBREW' },
        });
        // dh2 actor → its own homebrew branch.
        expect(materializeItemVariants(make(), 'dh2')['grants']).toBe('DH2-HOMEBREW');
        // ow actor → the raw branch.
        expect(materializeItemVariants(make(), 'ow')['grants']).toBe('OW-STATS');
        // rt actor (references the doc, no branch) → inherits the RAW (ow) stats.
        expect(materializeItemVariants(make(), 'rt')['grants']).toBe('OW-STATS');
    });
});

describe('materializeItemVariants', () => {
    it('flattens line and book variants in place to the active line + canonical book', () => {
        const source = {
            damage: { dh2: { __canonical: 'core', __books: { core: '1d10+3', ew: '1d10+5' } }, dh1: '1d10+2' },
            pen: { __canonical: 'core', __books: { core: 2, ew: 3 } },
            name: 'Lasgun',
        };
        materializeItemVariants(source, 'dh2');
        expect(source.damage).toBe('1d10+3');
        expect(source.pen).toBe(2);
        expect(source.name).toBe('Lasgun');
    });
});

describe('inferActiveGameLine', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('prefers the owning actor line', () => {
        expect(inferActiveGameLine({ actor: { system: { gameSystem: 'rt' } } })).toBe('rt');
    });

    it('falls back to the world primary game system when there is no actor', () => {
        vi.stubGlobal('game', { settings: { get: (): string => 'bc' } });
        expect(inferActiveGameLine()).toBe('bc');
    });

    it('resolves im from the world primary now that it is a recognised variant line', () => {
        vi.stubGlobal('game', { settings: { get: (): string => 'im' } });
        expect(inferActiveGameLine()).toBe('im');
    });
});

describe('isLineVariantContainer / normalizeGameLineKey', () => {
    it('detects line-keyed containers only', () => {
        expect(isLineVariantContainer({ dh2: 1 })).toBe(true);
        expect(isLineVariantContainer({ value: 1 })).toBe(false);
        expect(isLineVariantContainer({ __books: {} })).toBe(false);
    });

    it('normalizes supported line keys (including im) and rejects others', () => {
        expect(normalizeGameLineKey('dh2')).toBe('dh2');
        expect(normalizeGameLineKey('im')).toBe('im');
        expect(normalizeGameLineKey('nope')).toBeNull();
    });
});
