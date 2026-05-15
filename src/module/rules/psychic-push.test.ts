import { describe, expect, it } from 'vitest';
import { resolvePsyMode } from './psychic-push';

describe('resolvePsyMode', () => {
    it('fettered halves PR and grants +10 focus bonus, no phenomena', () => {
        expect(resolvePsyMode({ mode: 'fettered', basePR: 4 })).toEqual({
            effectivePR: 2,
            focusModifier: 10,
            forcePhenomena: false,
            phenomenaModifier: 0,
        });
    });

    it('fettered floors odd PR halves', () => {
        expect(resolvePsyMode({ mode: 'fettered', basePR: 5 }).effectivePR).toBe(2);
    });

    it('unfettered keeps base PR and 0 modifier', () => {
        expect(resolvePsyMode({ mode: 'unfettered', basePR: 4 })).toEqual({
            effectivePR: 4,
            focusModifier: 0,
            forcePhenomena: false,
            phenomenaModifier: 0,
        });
    });

    it('push +1 raises PR, applies −10 focus penalty, forces phenomena at +5', () => {
        expect(resolvePsyMode({ mode: 'push', basePR: 4, pushLevel: 1 })).toEqual({
            effectivePR: 5,
            focusModifier: -10,
            forcePhenomena: true,
            phenomenaModifier: 5,
        });
    });

    it('push scales linearly with the push level', () => {
        const r = resolvePsyMode({ mode: 'push', basePR: 4, pushLevel: 3 });
        expect(r.effectivePR).toBe(7);
        expect(r.focusModifier).toBe(-30);
        expect(r.phenomenaModifier).toBe(15);
    });

    it('push defaults to level 1 when pushLevel omitted', () => {
        const r = resolvePsyMode({ mode: 'push', basePR: 4 });
        expect(r.effectivePR).toBe(5);
    });
});
