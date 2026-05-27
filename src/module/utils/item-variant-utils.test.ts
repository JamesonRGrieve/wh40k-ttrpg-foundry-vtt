import { afterEach, describe, expect, it, vi } from 'vitest';
import { inferActiveGameLine, isLineVariantContainer, materializeItemVariants, normalizeGameLineKey, resolveLineVariant } from './item-variant-utils.ts';

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

    it('returns rt when the world primary is not a variant line (e.g. im)', () => {
        vi.stubGlobal('game', { settings: { get: (): string => 'im' } });
        expect(inferActiveGameLine()).toBe('rt');
    });
});

describe('isLineVariantContainer / normalizeGameLineKey', () => {
    it('detects line-keyed containers only', () => {
        expect(isLineVariantContainer({ dh2: 1 })).toBe(true);
        expect(isLineVariantContainer({ value: 1 })).toBe(false);
        expect(isLineVariantContainer({ __books: {} })).toBe(false);
    });

    it('normalizes supported line keys and rejects others', () => {
        expect(normalizeGameLineKey('dh2')).toBe('dh2');
        expect(normalizeGameLineKey('im')).toBeNull();
        expect(normalizeGameLineKey('nope')).toBeNull();
    });
});
