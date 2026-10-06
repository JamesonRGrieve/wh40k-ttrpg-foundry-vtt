import { describe, expect, it } from 'vitest';
import { hasDaemonic, type DaemonicActorLike } from './daemonic-immunities';

describe('hasDaemonic (#143)', () => {
    it('matches a trait item by its daemonic identifier', () => {
        const actor: DaemonicActorLike = { items: [{ type: 'trait', system: { identifier: 'daemonic' } }] };
        expect(hasDaemonic(actor)).toBe(true);
    });

    it('matches regardless of the display name ("Daemonic (X)" carries the same identifier)', () => {
        const actor: DaemonicActorLike = { items: [{ type: 'trait', system: { identifier: 'daemonic' } }] };
        expect(hasDaemonic(actor)).toBe(true);
    });

    it('ignores a non-trait item sharing the identifier', () => {
        const actor: DaemonicActorLike = { items: [{ type: 'talent', system: { identifier: 'daemonic' } }] };
        expect(hasDaemonic(actor)).toBe(false);
    });

    it('returns false when no Daemonic trait is present', () => {
        const actor: DaemonicActorLike = { items: [{ type: 'trait', system: { identifier: 'unnaturalToughness' } }] };
        expect(hasDaemonic(actor)).toBe(false);
    });

    it('returns false on an empty surface', () => {
        expect(hasDaemonic({})).toBe(false);
    });
});
