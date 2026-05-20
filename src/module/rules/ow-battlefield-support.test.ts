import { describe, it, expect } from 'vitest';
import { requestSupport, applySupportCooldown, type SupportAssetDef } from './ow-battlefield-support';

const ARTILLERY: SupportAssetDef = {
    id: 'asset-arty',
    kind: 'artillery',
    logisticsModifier: -10,
    cooldownTurns: 4,
};

const AIR_STRIKE: SupportAssetDef = {
    id: 'asset-air',
    kind: 'air-strike',
    logisticsModifier: -20,
    cooldownTurns: 6,
};

const REINFORCEMENTS: SupportAssetDef = {
    id: 'asset-reinf',
    kind: 'reinforcements',
    logisticsModifier: 0,
    cooldownTurns: 0,
};

describe('requestSupport', () => {
    it('succeeds when roll is at or below the asset-shifted target', () => {
        const result = requestSupport({ asset: ARTILLERY, currentLogisticsTarget: 50, roll: 30 });
        expect(result.successful).toBe(true);
        expect(result.effectiveTarget).toBe(40);
        expect(result.turnsUntilArrival).toBe(2);
    });

    it('fails when roll exceeds the asset-shifted target', () => {
        const result = requestSupport({ asset: ARTILLERY, currentLogisticsTarget: 50, roll: 45 });
        expect(result.successful).toBe(false);
        expect(result.effectiveTarget).toBe(40);
        expect(result.turnsUntilArrival).toBeUndefined();
    });

    it('treats roll equal to effective target as a success (roll-under-or-equal)', () => {
        const result = requestSupport({ asset: ARTILLERY, currentLogisticsTarget: 50, roll: 40 });
        expect(result.successful).toBe(true);
    });

    it('clamps the effective target at zero when the modifier would make it negative', () => {
        const HEAVY: SupportAssetDef = {
            id: 'asset-heavy',
            kind: 'orbital',
            logisticsModifier: -80,
            cooldownTurns: 8,
        };
        const result = requestSupport({ asset: HEAVY, currentLogisticsTarget: 20, roll: 5 });
        expect(result.effectiveTarget).toBe(0);
        expect(result.successful).toBe(false);
    });

    it('rounds the arrival delay up so even odd cooldowns deploy in an integer number of turns', () => {
        const ODD: SupportAssetDef = {
            id: 'asset-odd',
            kind: 'artillery',
            logisticsModifier: 0,
            cooldownTurns: 5,
        };
        const result = requestSupport({ asset: ODD, currentLogisticsTarget: 50, roll: 1 });
        expect(result.turnsUntilArrival).toBe(3);
    });

    it('reports a one-turn arrival for a zero-cooldown asset', () => {
        const result = requestSupport({ asset: REINFORCEMENTS, currentLogisticsTarget: 50, roll: 25 });
        expect(result.turnsUntilArrival).toBe(1);
    });

    it('applies a positive logistics modifier (easier request) additively', () => {
        const FAVOURED: SupportAssetDef = {
            id: 'asset-fav',
            kind: 'reinforcements',
            logisticsModifier: 15,
            cooldownTurns: 2,
        };
        const result = requestSupport({ asset: FAVOURED, currentLogisticsTarget: 40, roll: 50 });
        expect(result.effectiveTarget).toBe(55);
        expect(result.successful).toBe(true);
    });

    it('makes harder assets actually harder than easier ones at the same roll', () => {
        const easy = requestSupport({ asset: ARTILLERY, currentLogisticsTarget: 50, roll: 35 });
        const hard = requestSupport({ asset: AIR_STRIKE, currentLogisticsTarget: 50, roll: 35 });
        expect(easy.successful).toBe(true);
        expect(hard.successful).toBe(false);
    });
});

describe('applySupportCooldown', () => {
    it('subtracts elapsed turns from the remaining cooldown', () => {
        expect(applySupportCooldown({ remainingCooldown: 4, turnsElapsed: 1 })).toBe(3);
    });

    it('clamps the result at zero', () => {
        expect(applySupportCooldown({ remainingCooldown: 2, turnsElapsed: 5 })).toBe(0);
    });

    it('treats a negative remaining cooldown as zero', () => {
        expect(applySupportCooldown({ remainingCooldown: -3, turnsElapsed: 1 })).toBe(0);
    });

    it('treats a negative elapsed turns count as zero (no rollback)', () => {
        expect(applySupportCooldown({ remainingCooldown: 4, turnsElapsed: -2 })).toBe(4);
    });
});
