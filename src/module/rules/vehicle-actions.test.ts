import { describe, expect, it } from 'vitest';
import { getVehicleAction, getVehicleActionNames, VEHICLE_ACTIONS } from './vehicle-actions';

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
