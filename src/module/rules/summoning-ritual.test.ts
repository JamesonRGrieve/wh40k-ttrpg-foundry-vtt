import { describe, expect, it } from 'vitest';
import { bindingDurationHours, prepareSummoningRitual } from './summoning-ritual';

/**
 * Daemon summoning ritual (#80 — beyond.md p.59). Three-stage workflow:
 * (1) Hellish (−60) Forbidden Lore (Daemonology) test, (2) Daemonic
 * Mastery opposed vs daemon's Willpower, (3) binding duration in hours
 * = DoS of the Mastery test.
 *
 * Pins the Forbidden Lore target math, the Daemonic Mastery composition
 * (true-name / components / missing components factors), and the
 * binding-duration calc. The chat-card workflow that drives the ritual
 * UI remains a follow-up.
 */
describe('prepareSummoningRitual (#80)', () => {
    const base = { forbiddenLoreTotal: 50, willpowerTotal: 40, hasTrueName: false, hasComponents: true, extraFactors: [] };

    it('Forbidden Lore target = total − 60 (Hellish difficulty), floored at 0', () => {
        expect(prepareSummoningRitual({ ...base, forbiddenLoreTotal: 80 }).forbiddenLoreTarget).toBe(20);
        expect(prepareSummoningRitual({ ...base, forbiddenLoreTotal: 50 }).forbiddenLoreTarget).toBe(0); // Math.max(0, 50-60)=0
        expect(prepareSummoningRitual({ ...base, forbiddenLoreTotal: 30 }).forbiddenLoreTarget).toBe(0);
    });

    it('Daemonic Mastery breakdown includes the base-difficulty and proper-components factors', () => {
        const result = prepareSummoningRitual({ ...base, hasComponents: true });
        const labels = result.masteryBreakdown.map((b) => b.label);
        expect(labels).toContain('Daemonic Mastery (base Very Hard)');
        expect(labels).toContain('Proper Ritual Components');
        expect(labels).not.toContain('Missing Ritual Components');
    });

    it('Missing components substitutes the negative-modifier factor', () => {
        const result = prepareSummoningRitual({ ...base, hasComponents: false });
        const labels = result.masteryBreakdown.map((b) => b.label);
        expect(labels).toContain('Missing Ritual Components');
        expect(labels).not.toContain('Proper Ritual Components');
    });

    it('True Name appends the additional modifier factor', () => {
        const withName = prepareSummoningRitual({ ...base, hasTrueName: true });
        const withoutName = prepareSummoningRitual({ ...base, hasTrueName: false });
        expect(withName.masteryBreakdown.map((b) => b.label)).toContain('True Name');
        expect(withoutName.masteryBreakdown.map((b) => b.label)).not.toContain('True Name');
    });
});

describe('bindingDurationHours (#80)', () => {
    it('returns DoS hours for a positive DoS', () => {
        expect(bindingDurationHours(1)).toBe(1);
        expect(bindingDurationHours(3)).toBe(3);
        expect(bindingDurationHours(10)).toBe(10);
    });
    it('truncates fractional DoS', () => {
        expect(bindingDurationHours(2.7)).toBe(2);
    });
    it('returns 0 for non-positive DoS', () => {
        expect(bindingDurationHours(0)).toBe(0);
        expect(bindingDurationHours(-3)).toBe(0);
    });
});
