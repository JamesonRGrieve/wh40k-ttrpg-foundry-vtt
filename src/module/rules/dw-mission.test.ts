import { describe, expect, it } from 'vitest';
import { computeMissionRewards, type DwMission, type MissionComplication, type MissionObjective } from './dw-mission';

/**
 * Deathwatch Mission framework + Renown/XP rewards tests (#169 —
 * core.md §"MISSIONS" p. 10115, §"REWARDS" p. 10390).
 *
 * Pure-function payout: completed objectives award Renown/XP and recover
 * 1 Cohesion each; triggered complications subtract from the Renown total
 * (clamped at the RAW Renown floor of 0).
 */

function makeObjective(overrides: Partial<MissionObjective> = {}): MissionObjective {
    return {
        id: 'obj-1',
        description: 'Secure the relic.',
        renownReward: 3,
        xpReward: 200,
        status: 'pending',
        ...overrides,
    };
}

function makeComplication(overrides: Partial<MissionComplication> = {}): MissionComplication {
    return {
        id: 'comp-1',
        description: 'Civilian casualties.',
        renownPenalty: 2,
        ...overrides,
    };
}

function makeMission(overrides: Partial<DwMission> = {}): DwMission {
    return {
        id: 'mission-1',
        name: 'Operation Vigil',
        rating: 'standard',
        objectives: [],
        complications: [],
        ...overrides,
    };
}

describe('computeMissionRewards (#169)', () => {
    it('returns zero rewards for an empty mission', () => {
        const result = computeMissionRewards(makeMission(), []);
        expect(result.totalRenown).toBe(0);
        expect(result.totalXp).toBe(0);
        expect(result.cohesionRecovered).toBe(0);
        expect(result.perObjective).toEqual([]);
        expect(result.complicationsTriggered).toEqual([]);
    });

    it('awards Renown and XP for a completed objective', () => {
        const mission = makeMission({
            objectives: [makeObjective({ status: 'complete', renownReward: 4, xpReward: 250 })],
        });
        const result = computeMissionRewards(mission, []);
        expect(result.totalRenown).toBe(4);
        expect(result.totalXp).toBe(250);
        expect(result.perObjective).toEqual([{ id: 'obj-1', renown: 4, xp: 250 }]);
    });

    it('awards nothing for a failed objective', () => {
        const mission = makeMission({
            objectives: [makeObjective({ status: 'failed', renownReward: 4, xpReward: 250 })],
        });
        const result = computeMissionRewards(mission, []);
        expect(result.totalRenown).toBe(0);
        expect(result.totalXp).toBe(0);
        expect(result.cohesionRecovered).toBe(0);
        expect(result.perObjective).toEqual([{ id: 'obj-1', renown: 0, xp: 0 }]);
    });

    it('awards nothing for a pending objective', () => {
        const mission = makeMission({
            objectives: [makeObjective({ status: 'pending', renownReward: 4, xpReward: 250 })],
        });
        const result = computeMissionRewards(mission, []);
        expect(result.totalRenown).toBe(0);
        expect(result.totalXp).toBe(0);
        expect(result.cohesionRecovered).toBe(0);
    });

    it('recovers 1 Cohesion per completed objective (core.md §REWARDS)', () => {
        const mission = makeMission({
            objectives: [
                makeObjective({ id: 'a', status: 'complete' }),
                makeObjective({ id: 'b', status: 'complete' }),
                makeObjective({ id: 'c', status: 'complete' }),
                makeObjective({ id: 'd', status: 'failed' }),
                makeObjective({ id: 'e', status: 'pending' }),
            ],
        });
        const result = computeMissionRewards(mission, []);
        expect(result.cohesionRecovered).toBe(3);
    });

    it('subtracts the Renown penalty when a complication is triggered', () => {
        const mission = makeMission({
            objectives: [makeObjective({ status: 'complete', renownReward: 5, xpReward: 100 })],
            complications: [makeComplication({ id: 'comp-1', renownPenalty: 2 })],
        });
        const result = computeMissionRewards(mission, ['comp-1']);
        expect(result.totalRenown).toBe(3);
        expect(result.totalXp).toBe(100);
        expect(result.complicationsTriggered).toHaveLength(1);
        expect(result.complicationsTriggered[0]?.id).toBe('comp-1');
    });

    it('applies no penalty when the complication is not triggered', () => {
        const mission = makeMission({
            objectives: [makeObjective({ status: 'complete', renownReward: 5, xpReward: 100 })],
            complications: [makeComplication({ id: 'comp-1', renownPenalty: 2 })],
        });
        const result = computeMissionRewards(mission, []);
        expect(result.totalRenown).toBe(5);
        expect(result.totalXp).toBe(100);
        expect(result.complicationsTriggered).toEqual([]);
    });

    it('clamps net Renown at the RAW floor (0) when penalties exceed awards', () => {
        const mission = makeMission({
            objectives: [makeObjective({ status: 'complete', renownReward: 1, xpReward: 50 })],
            complications: [makeComplication({ id: 'comp-1', renownPenalty: 10 })],
        });
        const result = computeMissionRewards(mission, ['comp-1']);
        expect(result.totalRenown).toBe(0);
        expect(result.totalXp).toBe(50);
    });

    it('ignores unknown triggered-complication ids', () => {
        const mission = makeMission({
            objectives: [makeObjective({ status: 'complete', renownReward: 3, xpReward: 0 })],
            complications: [makeComplication({ id: 'comp-1', renownPenalty: 1 })],
        });
        const result = computeMissionRewards(mission, ['nonexistent']);
        expect(result.totalRenown).toBe(3);
        expect(result.complicationsTriggered).toEqual([]);
    });

    it('sums a mixed-status objective set with multiple triggered complications', () => {
        const mission = makeMission({
            rating: 'priority',
            objectives: [
                makeObjective({ id: 'a', status: 'complete', renownReward: 5, xpReward: 200 }),
                makeObjective({ id: 'b', status: 'complete', renownReward: 3, xpReward: 150 }),
                makeObjective({ id: 'c', status: 'failed', renownReward: 4, xpReward: 100 }),
                makeObjective({ id: 'd', status: 'pending', renownReward: 6, xpReward: 300 }),
            ],
            complications: [
                makeComplication({ id: 'cx', renownPenalty: 2 }),
                makeComplication({ id: 'cy', renownPenalty: 1 }),
                makeComplication({ id: 'cz', renownPenalty: 10 }),
            ],
        });
        const result = computeMissionRewards(mission, ['cx', 'cy']);
        // Renown: 5 + 3 - 2 - 1 = 5
        expect(result.totalRenown).toBe(5);
        // XP: 200 + 150 = 350 (failed/pending contribute nothing)
        expect(result.totalXp).toBe(350);
        // Cohesion: 2 completed
        expect(result.cohesionRecovered).toBe(2);
        expect(result.perObjective).toEqual([
            { id: 'a', renown: 5, xp: 200 },
            { id: 'b', renown: 3, xp: 150 },
            { id: 'c', renown: 0, xp: 0 },
            { id: 'd', renown: 0, xp: 0 },
        ]);
        expect(result.complicationsTriggered.map((c) => c.id)).toEqual(['cx', 'cy']);
    });

    it('coerces negative authored rewards to 0 rather than silently subtracting', () => {
        const mission = makeMission({
            objectives: [makeObjective({ status: 'complete', renownReward: -5, xpReward: -100 })],
            complications: [makeComplication({ id: 'comp-1', renownPenalty: -3 })],
        });
        const result = computeMissionRewards(mission, ['comp-1']);
        expect(result.totalRenown).toBe(0);
        expect(result.totalXp).toBe(0);
    });

    it('coerces non-finite authored rewards to 0', () => {
        const mission = makeMission({
            objectives: [makeObjective({ status: 'complete', renownReward: Number.NaN, xpReward: Number.POSITIVE_INFINITY })],
        });
        const result = computeMissionRewards(mission, []);
        expect(result.totalRenown).toBe(0);
        expect(result.totalXp).toBe(0);
    });
});
