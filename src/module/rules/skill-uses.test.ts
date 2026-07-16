import { describe, expect, it } from 'vitest';
import {
    applyFirstAidOutcome,
    firstAidDifficultyForTier,
    type FirstAidPatient,
    getSkillUse,
    getSkillUses,
    hasSkillUses,
    resolveFirstAid,
    type FirstAidTargetVitals,
} from './skill-uses.ts';

describe('skill-use registry (#432)', () => {
    it('offers only the general test for a skill with no special uses', () => {
        const uses = getSkillUses('awareness');
        expect(uses).toHaveLength(1);
        expect(uses[0]?.id).toBe('general');
        expect(hasSkillUses('awareness')).toBe(false);
    });

    it('offers Medicae Special Uses (general + First Aid + Extended Care + Surgery + …)', () => {
        const uses = getSkillUses('medicae');
        const ids = uses.map((u) => u.id);
        expect(ids[0]).toBe('general');
        expect(ids).toEqual(expect.arrayContaining(['firstAid', 'extendedCare', 'surgery', 'diagnose', 'extractBullet']));
        expect(hasSkillUses('medicae')).toBe(true);
    });

    it('marks the healing/operating uses as target-directed and the informational ones as not', () => {
        expect(getSkillUse('medicae', 'firstAid')?.needsTarget).toBe(true);
        expect(getSkillUse('medicae', 'surgery')?.needsTarget).toBe(true);
        expect(getSkillUse('medicae', 'diagnose')?.needsTarget).toBe(false);
        expect(getSkillUse('medicae', 'general')?.needsTarget).toBe(false);
    });

    it('sources each use difficulty from the shared MEDICAE_ACTIONS content registry', () => {
        expect(getSkillUse('medicae', 'firstAid')?.difficultyMod).toBe(0);
        expect(getSkillUse('medicae', 'extendedCare')?.difficultyMod).toBe(-10);
        expect(getSkillUse('medicae', 'surgery')?.difficultyMod).toBe(-20);
    });

    it('every use carries a namespaced langpack label key (no raw English)', () => {
        for (const use of getSkillUses('medicae')) {
            expect(use.labelKey).toMatch(/^WH40K\.SkillUse\./);
        }
    });

    it('returns null for an unknown use id', () => {
        expect(getSkillUse('medicae', 'nope')).toBeNull();
    });
});

describe('resolveFirstAid (#432)', () => {
    const vitals = (over: Partial<FirstAidTargetVitals> = {}): FirstAidTargetVitals => ({
        woundsValue: 3,
        woundsMax: 12,
        criticalDamage: 0,
        toughnessBonus: 4,
        ...over,
    });

    it('a failed test heals nothing', () => {
        const out = resolveFirstAid('firstAid', vitals(), 0);
        expect(out).toEqual({ success: false, woundsRestored: 0, criticalResolved: 0, bloodLossStopped: false });
    });

    it('First Aid restores 1 wound and closes blood loss on success', () => {
        const out = resolveFirstAid('firstAid', vitals(), 1);
        expect(out.success).toBe(true);
        expect(out.woundsRestored).toBe(1);
        expect(out.bloodLossStopped).toBe(true);
        expect(out.criticalResolved).toBe(0);
    });

    it('Extended Care restores Toughness-bonus wounds', () => {
        const out = resolveFirstAid('extendedCare', vitals({ toughnessBonus: 4 }), 2);
        expect(out.woundsRestored).toBe(4);
    });

    it('never overheals past max (clamped to missing-wounds headroom)', () => {
        const out = resolveFirstAid('extendedCare', vitals({ woundsValue: 10, woundsMax: 12, toughnessBonus: 5 }), 3);
        expect(out.woundsRestored).toBe(2); // only 2 wounds missing
    });

    it('Surgery removes one critical tier only when the patient carries critical damage', () => {
        expect(resolveFirstAid('surgery', vitals({ criticalDamage: 3 }), 1).criticalResolved).toBe(1);
        expect(resolveFirstAid('surgery', vitals({ criticalDamage: 0 }), 1).criticalResolved).toBe(0);
    });
});

describe('firstAidDifficultyForTier (#432)', () => {
    it('is harder the more damaged the patient is', () => {
        expect(firstAidDifficultyForTier(12, 12)).toBe(0); // unharmed
        expect(firstAidDifficultyForTier(7, 12)).toBe(-10); // lightly (>= half)
        expect(firstAidDifficultyForTier(2, 12)).toBe(-20); // heavily (< half)
    });
});

describe('applyFirstAidOutcome (#432)', () => {
    function patient(
        over: Partial<{ woundsValue: number; woundsMax: number; criticalDamage: number }> = {},
    ): FirstAidPatient & { patches: Array<{ woundsValue?: number; criticalDamage?: number }> } {
        const state = { woundsValue: 4, woundsMax: 12, criticalDamage: 2, ...over };
        const patches: Array<{ woundsValue?: number; criticalDamage?: number }> = [];
        return {
            get woundsValue() {
                return state.woundsValue;
            },
            get woundsMax() {
                return state.woundsMax;
            },
            get criticalDamage() {
                return state.criticalDamage;
            },
            patches,
            update: async (patch) => {
                patches.push(patch);
                return Promise.resolve();
            },
        };
    }

    it('writes restored wounds clamped to max', async () => {
        const p = patient({ woundsValue: 4, woundsMax: 12 });
        const wrote = await applyFirstAidOutcome(p, { success: true, woundsRestored: 3, criticalResolved: 0, bloodLossStopped: true });
        expect(wrote).toEqual({ woundsValue: 7 });
        expect(p.patches).toEqual([{ woundsValue: 7 }]);
    });

    it('writes reduced critical severity floored at zero', async () => {
        const p = patient({ criticalDamage: 1 });
        const wrote = await applyFirstAidOutcome(p, { success: true, woundsRestored: 0, criticalResolved: 3, bloodLossStopped: false });
        expect(wrote).toEqual({ criticalDamage: 0 });
    });

    it('does not persist when nothing changed', async () => {
        const p = patient();
        const wrote = await applyFirstAidOutcome(p, { success: false, woundsRestored: 0, criticalResolved: 0, bloodLossStopped: false });
        expect(wrote).toEqual({});
        expect(p.patches).toEqual([]);
    });
});
