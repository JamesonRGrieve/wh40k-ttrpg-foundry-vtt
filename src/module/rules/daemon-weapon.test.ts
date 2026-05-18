import { describe, expect, it } from 'vitest';
import { BINDING_STRENGTH_PROFILES, DAEMON_PERSONALITY_TRIGGERS, type BindingStrength, type DaemonPersonality } from './daemon-weapon';

/**
 * Daemon weapon binding (#81 — beyond.md p.50). Binding Strength tiers
 * govern attributes, Subtlety penalty while wielded, and the difficulty
 * of the Daemonic Mastery binding test. Personality triggers are
 * per-personality flavour hooks consumed when their trigger condition
 * is met.
 */

describe('BINDING_STRENGTH_PROFILES (#81)', () => {
    const tiers: BindingStrength[] = ['minor', 'lesser', 'normal', 'greater', 'major'];

    it('exposes a profile for every strength tier', () => {
        for (const tier of tiers) {
            expect(BINDING_STRENGTH_PROFILES[tier], `missing profile for tier: ${tier}`).toBeDefined();
            expect(BINDING_STRENGTH_PROFILES[tier].strength).toBe(tier);
        }
    });

    it('Minor: 1 attribute, −1 Subtlety, 0 binding difficulty', () => {
        const p = BINDING_STRENGTH_PROFILES.minor;
        expect(p.attributes).toBe(1);
        expect(p.subtletyPenalty).toBe(-1);
        expect(p.bindingDifficulty).toBe(0);
    });

    it('Major: 5 attributes, −8 Subtlety, −40 binding difficulty', () => {
        const p = BINDING_STRENGTH_PROFILES.major;
        expect(p.attributes).toBe(5);
        expect(p.subtletyPenalty).toBe(-8);
        expect(p.bindingDifficulty).toBe(-40);
    });

    it('attributes ladder is monotonically increasing 1 → 5', () => {
        const counts = tiers.map((t) => BINDING_STRENGTH_PROFILES[t].attributes);
        expect(counts).toEqual([1, 2, 3, 4, 5]);
    });

    it('Subtlety penalty ladder is monotonically more punishing as strength rises', () => {
        const penalties = tiers.map((t) => BINDING_STRENGTH_PROFILES[t].subtletyPenalty);
        for (let i = 1; i < penalties.length; i++) {
            const prev = penalties[i - 1] ?? 0;
            const cur = penalties[i] ?? 0;
            expect(cur).toBeLessThanOrEqual(prev);
        }
    });
});

describe('DAEMON_PERSONALITY_TRIGGERS (#81)', () => {
    const personalities: DaemonPersonality[] = ['jealous', 'prideful', 'vindictive', 'overbearing'];

    it('exposes a trigger + effect for every personality', () => {
        for (const personality of personalities) {
            const entry = DAEMON_PERSONALITY_TRIGGERS[personality];
            expect(entry, `missing trigger for personality: ${personality}`).toBeDefined();
            expect(entry.trigger.length).toBeGreaterThan(0);
            expect(entry.effect.length).toBeGreaterThan(0);
        }
    });
});
