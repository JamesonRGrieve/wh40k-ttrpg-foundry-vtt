import { describe, expect, it } from 'vitest';
import {
    OW_COMRADE_AUTO_RECOVERY_DAYS,
    OW_COMRADE_MEDICAE_DIFFICULTY_MODIFIER,
    applyMedicaeAttempt,
    buildComradeHealingPanel,
    type ComradeHealingRecord,
    comradeStateChange,
    processReplacement,
    tickComradeRecovery,
} from './ow-comrade-healing';

describe('ow-comrade-healing — comradeStateChange (#157)', () => {
    it('starts the seven-day clock, with its one Medicae attempt, when the Comrade is wounded', () => {
        expect(comradeStateChange('unharmed', 'wounded', 0)).toEqual({
            'system.comrade.state': 'wounded',
            'system.comradeRecoveryDays': OW_COMRADE_AUTO_RECOVERY_DAYS,
            'system.comradeMedicaeUsed': false,
        });
    });

    it('keeps a running clock when a wounded Comrade stays wounded', () => {
        expect(comradeStateChange('wounded', 'wounded', 4)).toEqual({ 'system.comrade.state': 'wounded', 'system.comradeRecoveryDays': 4 });
    });

    it('clears the clock when the Comrade is healed or dies', () => {
        expect(comradeStateChange('wounded', 'unharmed', 3)).toEqual({
            'system.comrade.state': 'unharmed',
            'system.comradeRecoveryDays': 0,
            'system.comradeMedicaeUsed': false,
        });
        expect(comradeStateChange('wounded', 'dead', 3)).toEqual({ 'system.comrade.state': 'dead', 'system.comradeRecoveryDays': 0 });
    });

    it('uses up the camp refit when a dead Comrade is replaced', () => {
        expect(comradeStateChange('dead', 'unharmed', 0)['system.refitAvailable']).toBe(false);
        expect(comradeStateChange('wounded', 'unharmed', 0)).not.toHaveProperty('system.refitAvailable');
    });
});

describe('ow-comrade-healing — buildComradeHealingPanel (#157)', () => {
    const record = (over: Partial<ComradeHealingRecord> = {}): ComradeHealingRecord => ({
        state: 'wounded',
        recoveryDays: 5,
        refitAvailable: false,
        medicaeUsed: false,
        ...over,
    });

    it('defines every value the panel renders (the sheet left autoRecoveryTotal and five others undefined)', () => {
        const view = buildComradeHealingPanel(record());
        expect(Object.values(view)).not.toContain(undefined);
        expect(view).toMatchObject({ autoRecoveryTotal: 7, medicaeDifficulty: -10, comradeState: 'wounded', recoveryDays: 5, status: 'recovering' });
    });

    it('labels the badge by status: recovering, ready or dead', () => {
        expect(buildComradeHealingPanel(record()).statusKey).toBe('WH40K.OW.ComradeHealing.Status.Recovering');
        expect(buildComradeHealingPanel(record({ state: 'unharmed', recoveryDays: 0 })).statusKey).toBe('WH40K.OW.ComradeHealing.Status.Ready');
        // A dead Comrade is not "ready for duty".
        expect(buildComradeHealingPanel(record({ state: 'dead', recoveryDays: 0 }))).toMatchObject({
            status: 'dead',
            isReady: false,
            statusKey: 'WH40K.OW.Comrade.State.Dead',
        });
    });

    it('allows a recovery day and the one Medicae attempt only while a wound is healing', () => {
        expect(buildComradeHealingPanel(record())).toMatchObject({ canTick: true, canMedicae: true });
        expect(buildComradeHealingPanel(record({ medicaeUsed: true }))).toMatchObject({ canTick: true, canMedicae: false });
        expect(buildComradeHealingPanel(record({ state: 'unharmed', recoveryDays: 0 }))).toMatchObject({ canTick: false, canMedicae: false });
        expect(buildComradeHealingPanel(record({ state: 'dead', recoveryDays: 0 }))).toMatchObject({ canTick: false, canMedicae: false });
    });

    it('allows replacement only for a dead Comrade back in camp', () => {
        expect(buildComradeHealingPanel(record({ state: 'dead', refitAvailable: true })).canReplace).toBe(true);
        expect(buildComradeHealingPanel(record({ state: 'dead', refitAvailable: false })).canReplace).toBe(false);
        expect(buildComradeHealingPanel(record({ state: 'wounded', refitAvailable: true })).canReplace).toBe(false);
    });
});

describe('ow-comrade-healing — constants', () => {
    it('publishes the RAW 7-day auto-recovery clock', () => {
        expect(OW_COMRADE_AUTO_RECOVERY_DAYS).toBe(7);
    });

    it('publishes the RAW Difficult(-10) Medicae modifier', () => {
        expect(OW_COMRADE_MEDICAE_DIFFICULTY_MODIFIER).toBe(-10);
    });
});

describe('ow-comrade-healing — tickComradeRecovery', () => {
    it('leaves remaining days unchanged when no time has elapsed', () => {
        expect(tickComradeRecovery({ remainingDays: 7, daysElapsed: 0 })).toEqual({
            remainingDays: 7,
            recovered: false,
        });
    });

    it('flags recovered when a full 7-day clock elapses', () => {
        expect(tickComradeRecovery({ remainingDays: 7, daysElapsed: 7 })).toEqual({
            remainingDays: 0,
            recovered: true,
        });
    });

    it('decrements remaining days for a partial elapsed window', () => {
        expect(tickComradeRecovery({ remainingDays: 7, daysElapsed: 3 })).toEqual({
            remainingDays: 4,
            recovered: false,
        });
    });

    it('clamps remaining days at 0 instead of going negative', () => {
        expect(tickComradeRecovery({ remainingDays: 2, daysElapsed: 5 })).toEqual({
            remainingDays: 0,
            recovered: true,
        });
    });

    it('coerces negative / non-finite inputs to 0', () => {
        expect(tickComradeRecovery({ remainingDays: -3, daysElapsed: Number.NaN })).toEqual({
            remainingDays: 0,
            recovered: true,
        });
    });
});

describe('ow-comrade-healing — applyMedicaeAttempt', () => {
    it('reduces remaining days by the test DoS', () => {
        expect(applyMedicaeAttempt({ remainingDays: 7, degreesOfSuccess: 3 })).toEqual({
            remainingDays: 4,
            reducedBy: 3,
        });
    });

    it('does nothing on a bare success (0 DoS)', () => {
        expect(applyMedicaeAttempt({ remainingDays: 7, degreesOfSuccess: 0 })).toEqual({
            remainingDays: 7,
            reducedBy: 0,
        });
    });

    it('clamps remaining days at 0 when DoS exceeds remainder', () => {
        expect(applyMedicaeAttempt({ remainingDays: 3, degreesOfSuccess: 10 })).toEqual({
            remainingDays: 0,
            reducedBy: 3,
        });
    });

    it('does nothing when there are no remaining days to shave', () => {
        expect(applyMedicaeAttempt({ remainingDays: 0, degreesOfSuccess: 5 })).toEqual({
            remainingDays: 0,
            reducedBy: 0,
        });
    });

    it('coerces negative DoS to 0', () => {
        expect(applyMedicaeAttempt({ remainingDays: 4, degreesOfSuccess: -2 })).toEqual({
            remainingDays: 4,
            reducedBy: 0,
        });
    });
});

describe('ow-comrade-healing — processReplacement', () => {
    it('replaces a dead Comrade when refit is available', () => {
        expect(processReplacement({ stateAtCamp: 'dead', refitAvailable: true })).toEqual({
            replaced: true,
            newState: 'unharmed',
        });
    });

    it('skips replacement when the Comrade is still alive (unharmed)', () => {
        expect(processReplacement({ stateAtCamp: 'unharmed', refitAvailable: true })).toEqual({
            replaced: false,
            newState: 'unharmed',
            reason: 'not-dead',
        });
    });

    it('skips replacement when the Comrade is wounded, not dead', () => {
        expect(processReplacement({ stateAtCamp: 'wounded', refitAvailable: true })).toEqual({
            replaced: false,
            newState: 'wounded',
            reason: 'not-dead',
        });
    });

    it('skips replacement when refit is unavailable', () => {
        expect(processReplacement({ stateAtCamp: 'dead', refitAvailable: false })).toEqual({
            replaced: false,
            newState: 'dead',
            reason: 'no-refit',
        });
    });
});
