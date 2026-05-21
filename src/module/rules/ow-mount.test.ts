import { describe, expect, it } from 'vitest';
import { MOUNTED_ACTIONS, applyMountedAttackModifier, getMountedAction, type MountedActionId } from './ow-mount';

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

describe('ow-mount · applyMountedAttackModifier', () => {
    it('applies Brutal Charge (+20) when the mount is charging', () => {
        const result = applyMountedAttackModifier({
            riderWeaponSkill: 40,
            mountTraits: ['brutal-charge'],
            charging: true,
        });
        expect(result.modifier).toBe(20);
        expect(result.reasons).toContain('WH40K.OW.Mount.Modifier.BrutalCharge');
    });

    it('does not apply Brutal Charge when not charging', () => {
        const result = applyMountedAttackModifier({
            riderWeaponSkill: 40,
            mountTraits: ['brutal-charge'],
            charging: false,
        });
        expect(result.modifier).toBe(0);
        expect(result.reasons).toEqual([]);
    });

    it('applies Steadfast (+10) on every mounted attack regardless of charging', () => {
        const charging = applyMountedAttackModifier({
            riderWeaponSkill: 40,
            mountTraits: ['steadfast'],
            charging: true,
        });
        expect(charging.modifier).toBe(10);
        expect(charging.reasons).toContain('WH40K.OW.Mount.Modifier.Steadfast');

        const stationary = applyMountedAttackModifier({
            riderWeaponSkill: 40,
            mountTraits: ['steadfast'],
            charging: false,
        });
        expect(stationary.modifier).toBe(10);
        expect(stationary.reasons).toContain('WH40K.OW.Mount.Modifier.Steadfast');
    });

    it('applies Sure-Footed (+10) on rough terrain only', () => {
        const rough = applyMountedAttackModifier({
            riderWeaponSkill: 40,
            mountTraits: ['sure-footed'],
            charging: false,
            roughTerrain: true,
        });
        expect(rough.modifier).toBe(10);
        expect(rough.reasons).toContain('WH40K.OW.Mount.Modifier.SureFooted');

        const flat = applyMountedAttackModifier({
            riderWeaponSkill: 40,
            mountTraits: ['sure-footed'],
            charging: false,
        });
        expect(flat.modifier).toBe(0);
        expect(flat.reasons).toEqual([]);
    });

    it('sums multiple applicable trait modifiers', () => {
        const result = applyMountedAttackModifier({
            riderWeaponSkill: 40,
            mountTraits: ['brutal-charge', 'steadfast', 'sure-footed'],
            charging: true,
            roughTerrain: true,
        });
        expect(result.modifier).toBe(40);
        expect(result.reasons).toEqual(['WH40K.OW.Mount.Modifier.BrutalCharge', 'WH40K.OW.Mount.Modifier.Steadfast', 'WH40K.OW.Mount.Modifier.SureFooted']);
    });

    it('ignores traits with no mechanical contribution to the attack modifier', () => {
        const result = applyMountedAttackModifier({
            riderWeaponSkill: 40,
            mountTraits: ['quadruped', 'unnatural-speed', 'fearless'],
            charging: true,
            roughTerrain: true,
        });
        expect(result.modifier).toBe(0);
        expect(result.reasons).toEqual([]);
    });
});
