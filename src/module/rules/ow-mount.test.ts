import { describe, expect, it } from 'vitest';
import { MOUNTED_ACTIONS, getMountedAction, type MountedActionId } from './ow-mount';

describe('ow-mount · MOUNTED_ACTIONS catalogue', () => {
    it('exposes all four RAW mounted special actions', () => {
        const ids = MOUNTED_ACTIONS.map((a) => a.id);
        expect(ids).toEqual(['charge', 'trample', 'run-down', 'mounted-attack']);
    });

    it('uses the correct action-economy timings', () => {
        const timings = Object.fromEntries(MOUNTED_ACTIONS.map((a) => [a.id, a.timing]));
        expect(timings).toEqual({
            'charge': 'full',
            'trample': 'full',
            'run-down': 'full',
            'mounted-attack': 'half',
        });
    });
});

describe('ow-mount · getMountedAction', () => {
    it('returns the action by id', () => {
        const charge = getMountedAction('charge');
        expect(charge.id).toBe('charge');
        expect(charge.timing).toBe('full');
    });

    it('throws on unknown id', () => {
        expect(() => getMountedAction('not-real' as MountedActionId)).toThrow(/unknown mounted action/i);
    });
});
