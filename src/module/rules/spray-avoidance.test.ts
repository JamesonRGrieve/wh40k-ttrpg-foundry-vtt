import { describe, expect, it } from 'vitest';
import { resolveSprayAvoidance } from './spray-avoidance';

/**
 * Spray quality avoidance (#103 — without.md p.62, composes with the
 * #57 Spray weapon-quality registry entry and #101 Leaping Dodge from
 * xenos-features.ts).
 */
describe('resolveSprayAvoidance (#103)', () => {
    it('default: raw Agility test', () => {
        const r = resolveSprayAvoidance({
            hasLeapingDodge: false,
            agilityTotal: 40,
            dodgeTotal: 55,
        });
        expect(r.skill).toBe('agility');
        expect(r.target).toBe(40);
    });

    it('Leaping Dodge upgrades to Dodge skill', () => {
        const r = resolveSprayAvoidance({
            hasLeapingDodge: true,
            agilityTotal: 40,
            dodgeTotal: 55,
        });
        expect(r.skill).toBe('dodge');
        expect(r.target).toBe(55);
    });

    it('floors negative totals at 0', () => {
        const r = resolveSprayAvoidance({
            hasLeapingDodge: false,
            agilityTotal: -10,
            dodgeTotal: 30,
        });
        expect(r.target).toBe(0);
    });
});
