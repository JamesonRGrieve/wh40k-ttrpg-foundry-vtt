import { describe, expect, it } from 'vitest';
import {
    getAerialManoeuvres,
    getVehicleAction,
    getVehicleActionNames,
    LOCK_ON_ENEMY_BS_BONUS,
    LOCK_ON_FREE_ATTACK_DOS,
    LOCK_ON_PILOT_BS_BONUS,
    resolveAerialManoeuvre,
    VEHICLE_ACTIONS,
} from './vehicle-actions';

describe('VEHICLE_ACTIONS registry', () => {
    it('lists the canonical core-book actions', () => {
        const names = getVehicleActionNames();
        for (const expected of ['Manoeuvre', 'Pull Stunt', 'Ram', 'Disengage', 'Hot-Wire', 'Suppress Fire (Vehicle)']) {
            expect(names).toContain(expected);
        }
    });

    it('includes the Without-supplement aerial actions for Flyer altitude work', () => {
        const names = getVehicleActionNames();
        expect(names).toContain('Lock On');
        expect(names).toContain('Tight Turn');
    });

    it('every entry declares both a time-cost and a subtype', () => {
        for (const action of VEHICLE_ACTIONS) {
            expect(action.type.length).toBeGreaterThan(0);
            expect(action.subtype.length).toBeGreaterThan(0);
        }
    });

    it('getVehicleAction returns the entry by exact name', () => {
        const ram = getVehicleAction('Ram');
        expect(ram).toBeDefined();
        expect(ram?.skill).toBe('operate');
    });

    it('returns undefined for unknown names', () => {
        expect(getVehicleAction('Teleport')).toBeUndefined();
    });
});

describe('Aerial Manoeuvres (#133 — without.md p. 54)', () => {
    it('flags Lock On and Tight Turn as Flyer-only', () => {
        expect(getVehicleAction('Lock On')?.flyerOnly).toBe(true);
        expect(getVehicleAction('Tight Turn')?.flyerOnly).toBe(true);
    });

    it('Lock On is a Half action; Tight Turn is a Full action with Concentration', () => {
        const lockOn = getVehicleAction('Lock On');
        const tightTurn = getVehicleAction('Tight Turn');
        expect(lockOn?.type).toEqual(['Half']);
        expect(lockOn?.subtype).toContain('Movement');
        expect(tightTurn?.type).toEqual(['Full']);
        expect(tightTurn?.subtype).toContain('Concentration');
        expect(tightTurn?.subtype).toContain('Movement');
    });

    it('getAerialManoeuvres returns exactly the two Flyer-gated entries', () => {
        const names = getAerialManoeuvres().map((a) => a.name);
        expect(names).toEqual(['Lock On', 'Tight Turn']);
    });

    describe('resolveAerialManoeuvre — Lock On', () => {
        it('grants the pilot +20 BS and enemies +10 on a win', () => {
            const r = resolveAerialManoeuvre('lock-on', true, { dosMargin: 1 });
            expect(r.success).toBe(true);
            expect(r.pilotBsBonus).toBe(LOCK_ON_PILOT_BS_BONUS);
            expect(r.enemyBsBonus).toBe(LOCK_ON_ENEMY_BS_BONUS);
            expect(r.freeAttack).toBe(false);
            expect(r.outcomeKey).toBe('WH40K.AerialManoeuvre.LockOn.OutcomeSuccess');
        });

        it('unlocks the Free Action attack at 3+ DoS over the opponent', () => {
            const r = resolveAerialManoeuvre('lock-on', true, { dosMargin: LOCK_ON_FREE_ATTACK_DOS });
            expect(r.freeAttack).toBe(true);
        });

        it('still hands enemies +10 even when the pilot loses the opposed test', () => {
            const r = resolveAerialManoeuvre('lock-on', false);
            expect(r.pilotBsBonus).toBe(0);
            expect(r.enemyBsBonus).toBe(LOCK_ON_ENEMY_BS_BONUS);
            expect(r.freeAttack).toBe(false);
            expect(r.outcomeKey).toBe('WH40K.AerialManoeuvre.LockOn.OutcomeFail');
        });

        it('does not change altitude', () => {
            const r = resolveAerialManoeuvre('lock-on', true, { currentAltitude: 'high' });
            expect(r.resultingAltitude).toBe('high');
            expect(r.forcedDescent).toBe(false);
        });
    });

    describe('resolveAerialManoeuvre — Tight Turn', () => {
        it('unlocks 90° turns and an optional ±1 altitude change on success', () => {
            const up = resolveAerialManoeuvre('tight-turn', true, { currentAltitude: 'low', altitudeDelta: 1 });
            expect(up.success).toBe(true);
            expect(up.tightTurnUnlocked).toBe(true);
            expect(up.resultingAltitude).toBe('high');
            expect(up.forcedDescent).toBe(false);
        });

        it('honours a -1 descent on success', () => {
            const down = resolveAerialManoeuvre('tight-turn', true, { currentAltitude: 'high', altitudeDelta: -1 });
            expect(down.resultingAltitude).toBe('low');
        });

        it('holds altitude on success when delta is 0', () => {
            const hold = resolveAerialManoeuvre('tight-turn', true, { currentAltitude: 'low' });
            expect(hold.resultingAltitude).toBe('low');
        });

        it('refuses an altitude jump that #99 canChangeAltitude rejects', () => {
            // From orbital, +1 has nowhere to go — clamps and stays put.
            const r = resolveAerialManoeuvre('tight-turn', true, { currentAltitude: 'orbital', altitudeDelta: 1 });
            expect(r.resultingAltitude).toBe('orbital');
        });

        it('drops one Altitude tier on failure', () => {
            const r = resolveAerialManoeuvre('tight-turn', false, { currentAltitude: 'high' });
            expect(r.success).toBe(false);
            expect(r.resultingAltitude).toBe('low');
            expect(r.forcedDescent).toBe(true);
            expect(r.outcomeKey).toBe('WH40K.AerialManoeuvre.TightTurn.OutcomeFail');
        });

        it('destabilises instead of descending when already at Ground', () => {
            const r = resolveAerialManoeuvre('tight-turn', false, { currentAltitude: 'ground' });
            expect(r.resultingAltitude).toBe('ground');
            expect(r.forcedDescent).toBe(true);
            expect(r.outcomeKey).toBe('WH40K.AerialManoeuvre.TightTurn.OutcomeDestabilise');
        });

        it('defaults to Low altitude when none supplied', () => {
            const r = resolveAerialManoeuvre('tight-turn', false);
            expect(r.resultingAltitude).toBe('ground');
        });
    });
});
