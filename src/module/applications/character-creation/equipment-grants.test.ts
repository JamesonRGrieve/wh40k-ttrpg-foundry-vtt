import { describe, expect, it } from 'vitest';
import {
    type AmmoIndexEntry,
    ammoWeaponTypesFor,
    collectEquipmentGrantPlans,
    equipmentNameKey,
    matchEquipmentEntry,
    pickStandardAmmo,
} from './equipment-grants.ts';

describe('collectEquipmentGrantPlans', () => {
    it('lists the fixed kit with its quantities and any UUID', () => {
        const plans = collectEquipmentGrantPlans({
            grants: {
                equipment: [
                    { name: 'Chainblade', quantity: 1 },
                    { name: 'Sacred Unguent', quantity: 2 },
                    { name: 'Chrono', uuid: 'Compendium.x.Item.c' },
                    { name: '  ' },
                ],
            },
        });
        expect(plans).toEqual([
            { name: 'Chainblade', uuid: undefined, quantity: 1 },
            { name: 'Sacred Unguent', uuid: undefined, quantity: 2 },
            { name: 'Chrono', uuid: 'Compendium.x.Item.c', quantity: 1 },
        ]);
    });

    it('adds the picked option of an equipment or gear choice, and ignores other choice types', () => {
        const plans = collectEquipmentGrantPlans({
            grants: {
                choices: [
                    {
                        type: 'gear',
                        label: 'Starting Equipment',
                        options: [
                            { name: 'Hand Flamer', value: 'Hand Flamer' },
                            { name: 'Laspistol', value: 'Laspistol' },
                        ],
                    },
                    {
                        type: 'equipment',
                        label: 'Starting Weapon',
                        options: [
                            { name: 'Autogun', value: 'Autogun' },
                            { name: 'Hand Cannon', value: 'Hand Cannon' },
                        ],
                    },
                    { type: 'skill', label: 'Starting Skill', options: [{ name: 'Awareness', value: 'Awareness' }] },
                ],
            },
            selectedChoices: { 'Starting Equipment': ['Laspistol'], 'Starting Weapon': ['Autogun'], 'Starting Skill': ['Awareness'] },
        });
        expect(plans.map((p) => p.name)).toEqual(['Laspistol', 'Autogun']);
    });

    it('gives nothing for an unpicked choice', () => {
        const plans = collectEquipmentGrantPlans({
            grants: { choices: [{ type: 'gear', label: 'Starting Gear', options: [{ name: 'Stablight', value: 'Stablight' }] }] },
        });
        expect(plans).toEqual([]);
    });
});

describe('matchEquipmentEntry', () => {
    const catalog = [
        { name: 'Data-Slate', uuid: 'a' },
        { name: 'Micro-Bead', uuid: 'b' },
        { name: 'Sacred Unguents', uuid: 'c' },
        { name: 'Laspistol', uuid: 'd' },
        { name: 'Laspistol', uuid: 'e' },
    ];

    it('prefers an exact name, first in pack priority order', () => {
        expect(matchEquipmentEntry(catalog, 'Laspistol')?.uuid).toBe('d');
    });

    it('falls back to a unique letters-only match', () => {
        expect(matchEquipmentEntry(catalog, 'Dataslate')?.uuid).toBe('a');
        expect(matchEquipmentEntry(catalog, 'Micro-bead')?.uuid).toBe('b');
        expect(matchEquipmentEntry(catalog, 'Sacred Unguent')?.uuid).toBe('c');
    });

    it('resolves nothing for an unknown or ambiguous loose name', () => {
        expect(matchEquipmentEntry(catalog, 'Stablight')).toBeUndefined();
        expect(matchEquipmentEntry([{ name: 'Glow Globe' }, { name: 'Glow-Globe' }], 'glowglobe')).toBeUndefined();
    });
});

describe('equipmentNameKey', () => {
    it('keeps letters only, lower case, without a plural s', () => {
        expect(equipmentNameKey('Sacred Unguents')).toBe('sacredunguent');
        expect(equipmentNameKey('Micro-Bead')).toBe('microbead');
    });
});

describe('pickStandardAmmo', () => {
    const entries: AmmoIndexEntry[] = [
        { uuid: 'hot', name: 'Hot-Shot Charge Packs', identifier: 'hot-shot-charge-packs', standard: false, weaponTypes: { dh2: ['las'] } },
        { uuid: 'ap', name: 'Autopistol Magazine', identifier: 'autopistol-magazine', standard: true, weaponTypes: { dh2: ['solid-projectile'] } },
        { uuid: 'ag', name: 'Autogun Magazine', identifier: 'autogun-magazine', standard: true, weaponTypes: { dh2: ['solid-projectile'] } },
        { uuid: 'lp', name: 'Laspistol Charge Pack', identifier: 'laspistol-charge-pack', standard: true, weaponTypes: { dh2: ['las'] } },
        { uuid: 'rt', name: 'Bolt Shells', identifier: 'bolt-shells', standard: true, weaponTypes: ['bolt'] },
    ];

    it('prefers the standard ammunition named for the weapon', () => {
        expect(pickStandardAmmo(entries, 'solid-projectile', 'autogun', 'dh2')?.uuid).toBe('ag');
        expect(pickStandardAmmo(entries, 'las', 'laspistol', 'dh2')?.uuid).toBe('lp');
    });

    it('falls back to the first standard entry for the type, never a special round', () => {
        expect(pickStandardAmmo(entries, 'solid-projectile', 'hand-cannon', 'dh2')?.uuid).toBe('ap');
        expect(pickStandardAmmo(entries, 'las', 'lasgun', 'dh2')?.uuid).toBe('lp');
    });

    it('reads a flat weaponTypes list as well as a per-line map', () => {
        expect(pickStandardAmmo(entries, 'bolt', 'boltgun', 'dh2')?.uuid).toBe('rt');
        expect(ammoWeaponTypesFor({ rt: ['las'] }, 'dh2')).toEqual([]);
    });

    it('finds nothing for a type with no standard ammunition, or no type', () => {
        expect(pickStandardAmmo(entries, 'melta', 'meltagun', 'dh2')).toBeUndefined();
        expect(pickStandardAmmo(entries, '', 'autogun', 'dh2')).toBeUndefined();
    });
});
