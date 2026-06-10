import { describe, expect, it } from 'vitest';
import { applyDeactivationQualities, deactivationStatDeltas, isDeactivated, type WeaponActivationConfig } from './weapon-activation.ts';

function config(overrides: { activatable?: boolean; deactivated?: Partial<WeaponActivationConfig['deactivated']> } = {}): WeaponActivationConfig {
    return {
        activatable: overrides.activatable ?? true,
        deactivated: {
            addedQualities: overrides.deactivated?.addedQualities ?? [],
            removedQualities: overrides.deactivated?.removedQualities ?? [],
            damage: overrides.deactivated?.damage ?? 0,
            penetration: overrides.deactivated?.penetration ?? 0,
        },
    };
}

describe('isDeactivated', () => {
    it('is false for a weapon with no activation config', () => {
        expect(isDeactivated(undefined, false)).toBe(false);
    });
    it('is false for a non-activatable weapon even if its state is off', () => {
        expect(isDeactivated(config({ activatable: false }), false)).toBe(false);
    });
    it('is false while activatable and powered (state.activated = true)', () => {
        expect(isDeactivated(config({ activatable: true }), true)).toBe(false);
    });
    it('is true only when activatable AND state.activated is off', () => {
        expect(isDeactivated(config({ activatable: true }), false)).toBe(true);
    });
});

describe('applyDeactivationQualities', () => {
    it('leaves qualities untouched when the weapon is active', () => {
        const q = new Set(['tearing', 'balanced']);
        applyDeactivationQualities(q, config({ deactivated: { removedQualities: ['tearing'], addedQualities: ['primitive'] } }), true);
        expect([...q].sort()).toEqual(['balanced', 'tearing']);
    });

    it('strips powered qualities and adds deactivated ones when off (chainsword → club)', () => {
        const q = new Set(['tearing', 'balanced']);
        applyDeactivationQualities(q, config({ deactivated: { removedQualities: ['tearing', 'balanced'], addedQualities: ['primitive'] } }), false);
        expect([...q].sort()).toEqual(['primitive']);
    });

    it('applies removals before additions', () => {
        // A profile that removes X and adds X nets to X present (add wins).
        const q = new Set(['x']);
        applyDeactivationQualities(q, config({ deactivated: { removedQualities: ['x'], addedQualities: ['x'] } }), false);
        expect(q.has('x')).toBe(true);
    });

    it('is a no-op for a non-activatable weapon', () => {
        const q = new Set(['shocking']);
        applyDeactivationQualities(q, config({ activatable: false, deactivated: { removedQualities: ['shocking'] } }), false);
        expect(q.has('shocking')).toBe(true);
    });
});

describe('deactivationStatDeltas', () => {
    it('returns 0/0 when active or non-activatable', () => {
        expect(deactivationStatDeltas(undefined, false)).toEqual({ damage: 0, penetration: 0 });
        expect(deactivationStatDeltas(config({ deactivated: { damage: -2, penetration: -5 } }), true)).toEqual({ damage: 0, penetration: 0 });
    });

    it('returns the profile deltas when deactivated (power weapon loses its field penetration)', () => {
        expect(deactivationStatDeltas(config({ deactivated: { damage: 0, penetration: -6 } }), false)).toEqual({ damage: 0, penetration: -6 });
    });
});
