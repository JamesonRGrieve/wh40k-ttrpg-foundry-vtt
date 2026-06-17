import { describe, expect, it } from 'vitest';
import DialogResolution from './dialog-resolution.ts';

describe('DialogResolution', () => {
    it('is not pending before track()', () => {
        const r = new DialogResolution<number | null>(null);
        expect(r.pending).toBe(false);
    });

    it('track() returns a promise that resolves with the value passed to resolve()', async () => {
        const r = new DialogResolution<number | null>(null);
        const result = r.track();
        expect(r.pending).toBe(true);
        r.resolve(42);
        await expect(result).resolves.toBe(42);
        expect(r.pending).toBe(false);
    });

    it('resolveDefault() resolves with the configured default value', async () => {
        const fallback = { selected: false, origin: null };
        const r = new DialogResolution<typeof fallback>(fallback);
        const result = r.track();
        r.resolveDefault();
        await expect(result).resolves.toEqual(fallback);
    });

    it('resolve() is idempotent — a second resolve / resolveDefault does not override the first', async () => {
        const r = new DialogResolution<number | null>(null);
        const result = r.track();
        r.resolve(7);
        r.resolve(9);
        r.resolveDefault();
        await expect(result).resolves.toBe(7);
    });

    it('resolveDefault() after an explicit resolve() is a no-op (confirm-then-close path)', async () => {
        const r = new DialogResolution<number | null>(null);
        const result = r.track();
        r.resolve(5);
        expect(r.pending).toBe(false);
        r.resolveDefault();
        await expect(result).resolves.toBe(5);
    });

    it('resolve() before track() is a no-op (no pending promise to settle)', () => {
        const r = new DialogResolution<number | null>(null);
        expect(() => {
            r.resolve(1);
        }).not.toThrow();
        expect(r.pending).toBe(false);
    });

    it('the resolver is stashed synchronously during track(), before the promise is awaited', async () => {
        const r = new DialogResolution<string | null>(null);
        const result = r.track();
        // Mirrors the dialog flow: render happens after track() returns, then the
        // promise is awaited — resolve() must already be wired by this point.
        expect(r.pending).toBe(true);
        r.resolve('ready');
        await expect(result).resolves.toBe('ready');
    });
});
