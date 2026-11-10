import { describe, expect, it } from 'vitest';
import { collectEquipmentGrantPlans, equipmentNameKey, matchEquipmentEntry } from './equipment-grants.ts';

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
