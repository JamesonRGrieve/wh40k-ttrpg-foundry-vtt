import { describe, expect, it } from 'vitest';
import { DAEMONHOST_TIERS } from './daemonhost';
import type { BindingStrength } from './daemon-weapon';

/**
 * Daemonhost creation + binding tiers (#85 — beyond.md p.66). Each
 * Binding Strength tier maps to a daemonhost with a stat baseline, the
 * number of Unholy Changes applied, and the Influence modifier + minimum
 * required to summon as a Reinforcement.
 */
describe('DAEMONHOST_TIERS (#85)', () => {
    const tiers: BindingStrength[] = ['minor', 'lesser', 'normal', 'greater', 'major'];

    it('exposes a tier entry for every Binding Strength', () => {
        for (const tier of tiers) {
            expect(DAEMONHOST_TIERS[tier], `missing tier: ${tier}`).toBeDefined();
            expect(DAEMONHOST_TIERS[tier].strength).toBe(tier);
        }
    });

    it('Unholy Changes ladder is monotonically increasing 1 → 5', () => {
        const counts = tiers.map((t) => DAEMONHOST_TIERS[t].unholyChanges);
        expect(counts).toEqual([1, 2, 3, 4, 5]);
    });

    it('Influence reinforcement modifier ladder gets harsher as tier rises', () => {
        const mods = tiers.map((t) => DAEMONHOST_TIERS[t].reinforcementModifier);
        for (let i = 1; i < mods.length; i++) {
            const prev = mods[i - 1] ?? 0;
            const cur = mods[i] ?? 0;
            expect(cur).toBeLessThanOrEqual(prev);
        }
        expect(mods[0]).toBe(0);
        expect(mods[mods.length - 1]).toBe(-40);
    });

    it('Minimum Influence ladder is monotonically increasing', () => {
        const mins = tiers.map((t) => DAEMONHOST_TIERS[t].minimumInfluence);
        for (let i = 1; i < mins.length; i++) {
            const prev = mins[i - 1] ?? 0;
            const cur = mins[i] ?? 0;
            expect(cur).toBeGreaterThanOrEqual(prev);
        }
        expect(mins[0]).toBe(20);
        expect(mins[mins.length - 1]).toBe(90);
    });

    it('canonical labels for the named tiers', () => {
        expect(DAEMONHOST_TIERS.minor.label).toBe('Minor Daemonhost');
        expect(DAEMONHOST_TIERS.normal.label).toBe('Daemonhost');
        expect(DAEMONHOST_TIERS.major.label).toBe('Major Daemonhost');
    });
});
