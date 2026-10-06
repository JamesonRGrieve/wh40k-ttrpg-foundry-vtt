import { describe, expect, it } from 'vitest';
import { castEffectsFor } from './psychic-cast-effects.ts';

const POWER = 'Compendium.wh40k-rpg.dh2-core-items-psychic-powers.Item.abc';

describe('castEffectsFor — what a manifested power applies, and to whom', () => {
    it('casts only non-transfer effects, re-pointed at the power and stripped of their id', () => {
        const cast = castEffectsFor(
            [
                { _id: 'e1', name: 'Stunned', transfer: false, duration: { rounds: 1 } },
                { _id: 'e2', name: 'Passive aura', transfer: true },
            ],
            'creature',
            POWER,
            true,
        );
        expect(cast).toEqual([{ recipient: 'target', data: { name: 'Stunned', transfer: false, duration: { rounds: 1 }, origin: POWER } }]);
    });

    it("routes a self-targeted power's effects to the psyker by default", () => {
        expect(castEffectsFor([{ name: 'Fire Shield' }], 'self', POWER, true)[0]?.recipient).toBe('self');
    });

    it("honours the effect's own castRecipient over the power's default", () => {
        const cast = castEffectsFor(
            [
                { name: 'Drain', flags: { 'wh40k-rpg': { castRecipient: 'target' } } },
                { name: 'Gain', flags: { 'wh40k-rpg': { castRecipient: 'self' } } },
            ],
            'creature',
            POWER,
            true,
        );
        expect(cast.map((c) => c.recipient)).toEqual(['target', 'self']);
    });

    it('ignores an unknown castRecipient and falls back to the power default', () => {
        expect(castEffectsFor([{ name: 'X', flags: { 'wh40k-rpg': { castRecipient: 'everyone' } } }], 'creature', POWER, true)[0]?.recipient).toBe('target');
    });

    it('lands everything on the psyker when the cast named no target', () => {
        expect(castEffectsFor([{ name: 'Smoke', flags: { 'wh40k-rpg': { castRecipient: 'target' } } }], 'creature', POWER, false)[0]?.recipient).toBe('self');
    });
});
