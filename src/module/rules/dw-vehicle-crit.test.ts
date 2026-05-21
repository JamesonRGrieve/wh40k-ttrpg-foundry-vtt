import { describe, expect, it } from 'vitest';
import {
    canKillTeamAcquire,
    DW_VEHICLE_CRIT_CHART,
    repairDifficultyFor,
    repairModifierFor,
    rollVehicleCrit,
    type DwVehicleCritResult,
    type VehicleAcquisition,
} from './dw-vehicle-crit';

/** Deterministic RNG that yields each provided sample in order. */
function rngOf(...samples: number[]): () => number {
    let i = 0;
    return () => {
        const next = (i < samples.length ? samples[i] : samples[samples.length - 1]) ?? 0;
        i += 1;
        return next;
    };
}

describe('DW_VEHICLE_CRIT_CHART', () => {
    it('covers ten contiguous roll cells', () => {
        expect(DW_VEHICLE_CRIT_CHART).toHaveLength(10);
        expect(DW_VEHICLE_CRIT_CHART.map((r) => r.roll)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });

    it('maps each roll to the canonical result identifier', () => {
        const expected: DwVehicleCritResult[] = ['minor', 'mobility', 'weapons', 'crew', 'engine', 'fire', 'catastrophic-fire', 'hull', 'cargo', 'wrecked'];
        expect(DW_VEHICLE_CRIT_CHART.map((r) => r.result)).toEqual(expected);
    });

    it('provides a non-empty description for every row', () => {
        for (const row of DW_VEHICLE_CRIT_CHART) {
            expect(row.description.length).toBeGreaterThan(0);
        }
    });
});

describe('rollVehicleCrit', () => {
    it('resolves rolled = 1 with no over-Integrity to Minor', () => {
        const result = rollVehicleCrit({ overIntegrity: 0, rng: rngOf(0) });
        expect(result.rolled).toBe(1);
        expect(result.finalRoll).toBe(1);
        expect(result.result).toBe('minor');
    });

    it('resolves the top of the d10 (sample just under 1) to Wrecked', () => {
        const result = rollVehicleCrit({ overIntegrity: 0, rng: rngOf(0.9999) });
        expect(result.rolled).toBe(10);
        expect(result.finalRoll).toBe(10);
        expect(result.result).toBe('wrecked');
    });

    it('adds over-Integrity to the rolled value', () => {
        // floor(0.4 * 10) + 1 = 5 → +2 over-Integrity = 7 (catastrophic-fire)
        const result = rollVehicleCrit({ overIntegrity: 2, rng: rngOf(0.4) });
        expect(result.rolled).toBe(5);
        expect(result.finalRoll).toBe(7);
        expect(result.result).toBe('catastrophic-fire');
    });

    it('clamps oversize sums to 10 (Wrecked)', () => {
        const result = rollVehicleCrit({ overIntegrity: 50, rng: rngOf(0.5) });
        expect(result.rolled).toBe(6);
        expect(result.finalRoll).toBe(10);
        expect(result.result).toBe('wrecked');
    });

    it('coerces negative over-Integrity to zero', () => {
        const result = rollVehicleCrit({ overIntegrity: -3, rng: rngOf(0.2) });
        expect(result.rolled).toBe(3);
        expect(result.finalRoll).toBe(3);
        expect(result.result).toBe('weapons');
    });

    it('coerces non-finite over-Integrity to zero', () => {
        const result = rollVehicleCrit({ overIntegrity: Number.NaN, rng: rngOf(0.8) });
        expect(result.rolled).toBe(9);
        expect(result.finalRoll).toBe(9);
        expect(result.result).toBe('cargo');
    });

    it('falls back to a safe sample when the rng emits a non-finite value', () => {
        const result = rollVehicleCrit({ overIntegrity: 0, rng: rngOf(Number.NaN) });
        // Bad sample is coerced to 0 → floor(0 * 10) + 1 = 1.
        expect(result.rolled).toBe(1);
        expect(result.result).toBe('minor');
    });

    it('returns the matching description from the chart', () => {
        const result = rollVehicleCrit({ overIntegrity: 0, rng: rngOf(0.5) });
        expect(result.finalRoll).toBe(6);
        expect(result.description).toBe(DW_VEHICLE_CRIT_CHART[5]?.description);
    });
});

describe('repairDifficultyFor', () => {
    it('routes Minor damage to Routine repairs', () => {
        expect(repairDifficultyFor('minor')).toBe('routine');
    });

    it('routes Mobility/Weapons/Cargo damage to Challenging repairs', () => {
        expect(repairDifficultyFor('mobility')).toBe('challenging');
        expect(repairDifficultyFor('weapons')).toBe('challenging');
        expect(repairDifficultyFor('cargo')).toBe('challenging');
    });

    it('routes Crew/Engine/Hull/Fire/Catastrophic Fire/Wrecked damage to Hard repairs', () => {
        expect(repairDifficultyFor('crew')).toBe('hard');
        expect(repairDifficultyFor('engine')).toBe('hard');
        expect(repairDifficultyFor('hull')).toBe('hard');
        expect(repairDifficultyFor('fire')).toBe('hard');
        expect(repairDifficultyFor('catastrophic-fire')).toBe('hard');
        expect(repairDifficultyFor('wrecked')).toBe('hard');
    });
});

describe('repairModifierFor', () => {
    it('uses the RAW Tech-Use ladder', () => {
        expect(repairModifierFor('routine')).toBe(20);
        expect(repairModifierFor('challenging')).toBe(0);
        expect(repairModifierFor('hard')).toBe(-20);
    });
});

describe('canKillTeamAcquire', () => {
    const rhino: VehicleAcquisition = { baseCost: 20, renownGate: 'initiated' };
    const landRaider: VehicleAcquisition = { baseCost: 80, renownGate: 'distinguished' };

    it('allows acquisition when both RP and rank gates clear', () => {
        const result = canKillTeamAcquire({
            teamRp: 80,
            vehicle: landRaider,
            actorRenownRank: 'distinguished',
        });
        expect(result.allowed).toBe(true);
        expect(result.reason).toBeUndefined();
    });

    it('blocks on rank before checking RP', () => {
        const result = canKillTeamAcquire({
            teamRp: 0,
            vehicle: landRaider,
            actorRenownRank: 'initiated',
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('rank-too-low');
    });

    it('blocks on RP when rank clears but the pool is short', () => {
        const result = canKillTeamAcquire({
            teamRp: 10,
            vehicle: rhino,
            actorRenownRank: 'hero',
        });
        expect(result.allowed).toBe(false);
        expect(result.reason).toBe('insufficient-rp');
    });

    it('allows exact-cost acquisition (RP equal to baseCost)', () => {
        const result = canKillTeamAcquire({
            teamRp: 20,
            vehicle: rhino,
            actorRenownRank: 'respected',
        });
        expect(result.allowed).toBe(true);
    });

    it('allows higher-rank actors through a lower gate', () => {
        const result = canKillTeamAcquire({
            teamRp: 20,
            vehicle: rhino,
            actorRenownRank: 'hero',
        });
        expect(result.allowed).toBe(true);
    });
});
