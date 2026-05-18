import { describe, expect, it } from 'vitest';
import {
    ESCAPE_PINNING_FAVOURABLE_BONUS,
    PINNED_ACTION_RESTRICTION,
    PINNED_BS_PENALTY,
    resolveEscapePinningTest,
    resolvePinningTest,
} from './pinning';

describe('resolvePinningTest (#111)', () => {
    it('target = WP (Challenging +0) by default', () => {
        expect(resolvePinningTest({ willpowerTotal: 40 }).target).toBe(40);
    });
    it('applies the optional trigger modifier', () => {
        expect(resolvePinningTest({ willpowerTotal: 40, triggerModifier: -10 }).target).toBe(30);
        expect(resolvePinningTest({ willpowerTotal: 40, triggerModifier: 10 }).target).toBe(50);
    });
    it('floors target at 0', () => {
        expect(resolvePinningTest({ willpowerTotal: 5, triggerModifier: -20 }).target).toBe(0);
    });
});

describe('resolveEscapePinningTest (#111)', () => {
    it('plain WP when not in cover and being shot at', () => {
        const r = resolveEscapePinningTest({ willpowerTotal: 40, notBeingShotAt: false, inCover: false });
        expect(r.target).toBe(40);
        expect(r.favourableBonus).toBe(false);
    });
    it('+30 when in cover (alone)', () => {
        const r = resolveEscapePinningTest({ willpowerTotal: 40, notBeingShotAt: false, inCover: true });
        expect(r.target).toBe(70);
        expect(r.favourableBonus).toBe(true);
    });
    it('+30 when not being shot at (alone)', () => {
        const r = resolveEscapePinningTest({ willpowerTotal: 40, notBeingShotAt: true, inCover: false });
        expect(r.target).toBe(70);
    });
    it('+30 bonus does NOT stack — both flags give the same bonus', () => {
        const r = resolveEscapePinningTest({ willpowerTotal: 40, notBeingShotAt: true, inCover: true });
        expect(r.target).toBe(70);
    });
});

describe('Pinned condition constants (#111)', () => {
    it('BS penalty is −20', () => {
        expect(PINNED_BS_PENALTY).toBe(-20);
    });
    it('restricts to half-action-only', () => {
        expect(PINNED_ACTION_RESTRICTION).toBe('half-action-only');
    });
    it('escape favourable bonus is +30', () => {
        expect(ESCAPE_PINNING_FAVOURABLE_BONUS).toBe(30);
    });
});
