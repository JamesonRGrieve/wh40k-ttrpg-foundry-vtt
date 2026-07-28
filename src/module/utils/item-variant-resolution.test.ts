/**
 * Regression guard (#503): an unresolved per-line variant container must be
 * DISTINGUISHABLE from a resolved value.
 *
 * `resolveLineVariant` returns its input when it cannot pick a branch, so the
 * call site sees a container object where it expected a scalar. Coercing it —
 * `Boolean({dh1: false, dh2: false, rt: false})` is `true` — turned "I could not
 * work out this weapon's game line" into "this weapon is melee", which is the
 * one answer that unlocks Charge and WS-based attacks. Aberrant Primus's autogun
 * offered Charge because of exactly this.
 */

import { describe, expect, it } from 'vitest';
import { resolveLineVariant, tryResolveLineVariant } from './item-variant-utils.ts';

describe('tryResolveLineVariant (#503)', () => {
    it('resolves a well-formed container to the active line branch, including `false`', () => {
        // `false` must survive: `value[lineKey] ?? …` uses nullish coalescing, so
        // an authored `false` is a real answer, not a miss.
        const container = { dh1: false, dh2: false, rt: false };
        const outcome = tryResolveLineVariant(container, 'dh2');
        expect(outcome).toEqual({ resolved: true, value: false });
    });

    it('falls back to another authored line when the active one has no branch', () => {
        expect(tryResolveLineVariant({ dh1: 'basic', rt: 'basic' }, 'dw')).toEqual({ resolved: true, value: 'basic' });
    });

    it('reports UNRESOLVED for a container whose every branch is empty', () => {
        // The failure shape: nothing to select, so the container passes through.
        const outcome = tryResolveLineVariant({ dh1: undefined, dh2: null }, 'dh2');
        expect(outcome.resolved).toBe(false);
        expect(outcome.value).toEqual({ dh1: undefined, dh2: null });
    });

    it('treats a plain scalar as trivially resolved', () => {
        expect(tryResolveLineVariant(false, 'dh2')).toEqual({ resolved: true, value: false });
        expect(tryResolveLineVariant('basic', 'dh2')).toEqual({ resolved: true, value: 'basic' });
    });

    it('an unresolved container is never coerced to a truthy flag', () => {
        // The exact defect: this is what `Boolean(resolveLineVariant(...))` did.
        const unresolved = { dh1: undefined, dh2: undefined };
        expect(Boolean(resolveLineVariant(unresolved, 'dh2'))).toBe(true); // the old, wrong answer
        expect(tryResolveLineVariant(unresolved, 'dh2').resolved).toBe(false); // now detectable
    });

    it('resolveLineVariant keeps its existing contract for callers that do not care', () => {
        expect(resolveLineVariant({ dh2: 'pistol' }, 'dh2')).toBe('pistol');
        const passthrough = { dh1: undefined };
        expect(resolveLineVariant(passthrough, 'dh2')).toBe(passthrough);
    });
});
