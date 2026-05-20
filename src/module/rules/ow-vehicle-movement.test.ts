import { describe, expect, it } from 'vitest';
import {
    CHASE_DANGER_ZONE_DOF_THRESHOLD,
    getOwVehicleAction,
    OW_VEHICLE_ACTIONS,
    tickHighSpeedChase,
    type ChaseTrackerState,
    type OwVehicleActionId,
} from './ow-vehicle-movement';

/**
 * RAW OW vehicle movement action + High-Speed Chase tracker tests
 * (#156 — core.md §"VEHICLE MOVEMENT", p.12305).
 *
 * Every literal in the timing table is grounded in the rulebook; the
 * chase arithmetic uses round numbers so a failure points to a
 * specific gate rather than drifting math.
 */

const FRESH_STATE: ChaseTrackerState = {
    pursuerDistance: 100,
    dangerZone: false,
    turnCount: 0,
};

describe('OW_VEHICLE_ACTIONS catalogue', () => {
    it('contains all five named actions', () => {
        const ids = OW_VEHICLE_ACTIONS.map((action) => action.id).sort();
        expect(ids).toEqual(['evasive-manoeuvring', 'floor-it', 'hit-and-run', 'jink', 'tactical-manoeuvring']);
    });

    it.each<[OwVehicleActionId, 'full' | 'half' | 'reaction']>([
        ['evasive-manoeuvring', 'half'],
        ['floor-it', 'full'],
        ['hit-and-run', 'full'],
        ['jink', 'reaction'],
        ['tactical-manoeuvring', 'half'],
    ])('assigns RAW timing %s → %s', (id, timing) => {
        const action = getOwVehicleAction(id);
        expect(action.timing).toBe(timing);
    });

    it('returns a non-empty description for each action', () => {
        for (const action of OW_VEHICLE_ACTIONS) {
            expect(action.description.length).toBeGreaterThan(0);
        }
    });
});

describe('getOwVehicleAction', () => {
    it('looks up an action by id', () => {
        const action = getOwVehicleAction('jink');
        expect(action.id).toBe('jink');
        expect(action.timing).toBe('reaction');
    });

    it('throws on an unknown id', () => {
        expect(() => getOwVehicleAction('not-an-action' as OwVehicleActionId)).toThrow(/Unknown OW vehicle action id/);
    });
});

describe('tickHighSpeedChase — distance arithmetic', () => {
    it('decreases distance when pursuer wins the opposed test', () => {
        const next = tickHighSpeedChase({
            state: FRESH_STATE,
            pursuerOperateDoS: 3,
            pursuerOperateDoF: 0,
            targetOperateDoS: 1,
            targetOperateDoF: 0,
            closeRate: 10,
        });
        // Net DoS = 3 - 1 = 2; closeRate 10 → distance moves 20 closer.
        expect(next.pursuerDistance).toBe(80);
        expect(next.dangerZone).toBe(false);
    });

    it('increases distance when target wins the opposed test', () => {
        const next = tickHighSpeedChase({
            state: FRESH_STATE,
            pursuerOperateDoS: 0,
            pursuerOperateDoF: 0,
            targetOperateDoS: 2,
            targetOperateDoF: 0,
            closeRate: 15,
        });
        // Net DoS = -2; closeRate 15 → distance opens by 30.
        expect(next.pursuerDistance).toBe(130);
        expect(next.dangerZone).toBe(false);
    });

    it('leaves distance unchanged on a tied opposed test', () => {
        const next = tickHighSpeedChase({
            state: FRESH_STATE,
            pursuerOperateDoS: 2,
            pursuerOperateDoF: 0,
            targetOperateDoS: 2,
            targetOperateDoF: 0,
            closeRate: 25,
        });
        expect(next.pursuerDistance).toBe(100);
    });
});

describe('tickHighSpeedChase — danger zone', () => {
    it('flags danger zone when distance reaches zero (pursuer caught target)', () => {
        const next = tickHighSpeedChase({
            state: { pursuerDistance: 20, dangerZone: false, turnCount: 0 },
            pursuerOperateDoS: 5,
            pursuerOperateDoF: 0,
            targetOperateDoS: 1,
            targetOperateDoF: 0,
            closeRate: 5,
        });
        // Net DoS = 4; closeRate 5 → distance drops 20 → exactly 0.
        expect(next.pursuerDistance).toBe(0);
        expect(next.dangerZone).toBe(true);
    });

    it('flags danger zone on pursuer DoF ≥ threshold', () => {
        const next = tickHighSpeedChase({
            state: FRESH_STATE,
            pursuerOperateDoS: 0,
            pursuerOperateDoF: CHASE_DANGER_ZONE_DOF_THRESHOLD,
            targetOperateDoS: 0,
            targetOperateDoF: 0,
            closeRate: 10,
        });
        expect(next.dangerZone).toBe(true);
    });

    it('flags danger zone on target DoF ≥ threshold', () => {
        const next = tickHighSpeedChase({
            state: FRESH_STATE,
            pursuerOperateDoS: 0,
            pursuerOperateDoF: 0,
            targetOperateDoS: 0,
            targetOperateDoF: CHASE_DANGER_ZONE_DOF_THRESHOLD + 2,
            closeRate: 10,
        });
        expect(next.dangerZone).toBe(true);
    });

    it('does not flag danger zone for DoF below threshold and distance > 0', () => {
        const next = tickHighSpeedChase({
            state: FRESH_STATE,
            pursuerOperateDoS: 1,
            pursuerOperateDoF: CHASE_DANGER_ZONE_DOF_THRESHOLD - 1,
            targetOperateDoS: 0,
            targetOperateDoF: CHASE_DANGER_ZONE_DOF_THRESHOLD - 1,
            closeRate: 5,
        });
        expect(next.dangerZone).toBe(false);
    });
});

describe('tickHighSpeedChase — turn counter', () => {
    it('increments turnCount by 1 per tick', () => {
        const t1 = tickHighSpeedChase({
            state: FRESH_STATE,
            pursuerOperateDoS: 1,
            pursuerOperateDoF: 0,
            targetOperateDoS: 1,
            targetOperateDoF: 0,
            closeRate: 10,
        });
        expect(t1.turnCount).toBe(1);

        const t2 = tickHighSpeedChase({
            state: t1,
            pursuerOperateDoS: 0,
            pursuerOperateDoF: 0,
            targetOperateDoS: 0,
            targetOperateDoF: 0,
            closeRate: 10,
        });
        expect(t2.turnCount).toBe(2);

        const t3 = tickHighSpeedChase({
            state: t2,
            pursuerOperateDoS: 2,
            pursuerOperateDoF: 0,
            targetOperateDoS: 0,
            targetOperateDoF: 0,
            closeRate: 10,
        });
        expect(t3.turnCount).toBe(3);
    });
});
