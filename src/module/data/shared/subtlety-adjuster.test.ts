import { describe, expect, it } from 'vitest';
import { type RawSubtletyAdjuster, subtletyAdjusterEffectOf } from './subtlety-adjuster';

/**
 * `subtletyAdjusterEffectOf` is the single normalizer that turns a raw
 * `system.subtletyAdjuster` value (authored on a compendium document) into the
 * runtime effect the actor tree-walk consumes. It must be pure and treat an
 * absent field / `kind: 'none'` identically as "no adjuster" so legacy
 * documents without the field behave correctly (CLAUDE.md Direction #7).
 */
describe('subtletyAdjusterEffectOf', () => {
    it('returns null for undefined (legacy document with no field)', () => {
        expect(subtletyAdjusterEffectOf(undefined)).toBeNull();
    });

    it('returns null for null', () => {
        expect(subtletyAdjusterEffectOf(null)).toBeNull();
    });

    it("returns null for the schema default kind 'none'", () => {
        const raw: RawSubtletyAdjuster = { kind: 'none', delta: 0, minAbsoluteDelta: 0, requiresEquipped: false };
        expect(subtletyAdjusterEffectOf(raw)).toBeNull();
    });

    it('passes a clamp adjuster through with its minAbsoluteDelta (Quarantine World)', () => {
        const raw: RawSubtletyAdjuster = { kind: 'clamp', delta: 0, minAbsoluteDelta: 1, requiresEquipped: false };
        expect(subtletyAdjusterEffectOf(raw)).toEqual({
            kind: 'clamp',
            delta: 0,
            minAbsoluteDelta: 1,
            requiresEquipped: false,
        });
    });

    it('passes a passive equipped-gated adjuster through (Daemon Weapon)', () => {
        const raw: RawSubtletyAdjuster = { kind: 'passive', delta: -1, minAbsoluteDelta: 0, requiresEquipped: true };
        expect(subtletyAdjusterEffectOf(raw)).toEqual({
            kind: 'passive',
            delta: -1,
            minAbsoluteDelta: 0,
            requiresEquipped: true,
        });
    });

    it('passes an event adjuster through (Dark Pact)', () => {
        const raw: RawSubtletyAdjuster = { kind: 'event', delta: -3, minAbsoluteDelta: 0, requiresEquipped: false };
        expect(subtletyAdjusterEffectOf(raw)).toEqual({
            kind: 'event',
            delta: -3,
            minAbsoluteDelta: 0,
            requiresEquipped: false,
        });
    });
});
