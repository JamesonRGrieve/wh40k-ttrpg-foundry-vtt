import { describe, expect, it } from 'vitest';
import {
    type ArmourModSource,
    armourModCategory,
    type ArmourSlots,
    freeSubsystemSlots,
    freeUpgradeSlots,
    installedEntry,
    installVerdict,
    modArmourBonus,
    subsystemCapacity,
} from './armour-modifications.ts';

/** A Black Crusade suit of Legion power armour: two upgrade slots, three sub-systems (#730). */
function legionArmour(modifications: ArmourSlots['modifications'] = []): ArmourSlots {
    return { type: 'power', modificationSlots: 2, subsystemSlots: 3, modifications };
}

function mod(category: string, extra: Partial<ArmourModSource['modifiers']> = {}, armourTypes: string[] = ['power']): ArmourModSource {
    return { category, restrictions: { armourTypes }, modifiers: { armourPoints: 0, maxAgility: 0, ...extra } };
}

const fitted = (uuid: string, source: ArmourModSource): ArmourSlots['modifications'][number] => installedEntry(uuid, uuid, source);

describe('armourModCategory', () => {
    it('reads the three categories and treats anything else as an upgrade (every mod before #730)', () => {
        expect(armourModCategory('subsystem')).toBe('subsystem');
        expect(armourModCategory('customisation')).toBe('customisation');
        expect(armourModCategory('upgrade')).toBe('upgrade');
        for (const raw of ['', null, undefined, 'Subsystem']) expect(armourModCategory(raw)).toBe('upgrade');
    });
});

describe('installVerdict (#730)', () => {
    it('fits three sub-systems to Legion power armour and refuses a fourth', () => {
        let armour = legionArmour();
        for (const uuid of ['vox', 'auto-senses', 'gill']) {
            expect(installVerdict(armour, uuid, mod('subsystem'))).toBe('ok');
            armour = legionArmour([...armour.modifications, fitted(uuid, mod('subsystem'))]);
        }
        expect(freeSubsystemSlots(armour)).toBe(0);
        expect(installVerdict(armour, 'boots', mod('subsystem'))).toBe('no-subsystem-slot');
    });

    it('lets Careful Maintenance add two sub-system slots', () => {
        const maintained = legionArmour([fitted('maintenance', mod('customisation', { subsystemSlots: 2 }))]);
        expect(subsystemCapacity(maintained)).toBe(5);
        expect(freeSubsystemSlots(maintained)).toBe(5);
    });

    it('counts sub-systems and customisations apart from the upgrade slots', () => {
        const armour = legionArmour([fitted('vox', mod('subsystem')), fitted('horns', mod('customisation'))]);
        expect(freeUpgradeSlots(armour)).toBe(2);
        expect(installVerdict(armour, 'ablative', mod('upgrade'))).toBe('ok');
        const full = legionArmour([fitted('a', mod('upgrade')), fitted('b', mod('upgrade'))]);
        expect(installVerdict(full, 'c', mod('upgrade'))).toBe('no-upgrade-slot');
        // Customisations have no slot limit.
        expect(installVerdict(full, 'spikes', mod('customisation'))).toBe('ok');
    });

    it("refuses a mod the suit's armour type does not allow, and one already fitted", () => {
        const carapace: ArmourSlots = { ...legionArmour(), type: 'carapace' };
        expect(installVerdict(carapace, 'vox', mod('subsystem'))).toBe('wrong-armour-type');
        expect(installVerdict(carapace, 'any-mod', mod('upgrade', {}, ['any']))).toBe('ok');
        expect(installVerdict(carapace, 'unrestricted', mod('upgrade', {}, []))).toBe('ok');
        expect(installVerdict(legionArmour([fitted('vox', mod('subsystem'))]), 'vox', mod('subsystem'))).toBe('duplicate');
    });
});

describe('modArmourBonus (#730)', () => {
    it("adds Enhanced Ceramite Plating's +2 on the Body only", () => {
        const mods = [fitted('ceramite', mod('subsystem', { locations: { body: 2 } }))];
        expect(modArmourBonus(mods, 'body')).toBe(2);
        expect(modArmourBonus(mods, 'head')).toBe(0);
    });

    it('adds a flat bonus everywhere, and nothing from an inactive mod', () => {
        const ablative = fitted('ablative', mod('upgrade', { armourPoints: 5 }));
        expect(modArmourBonus([ablative], 'leftLeg')).toBe(5);
        expect(modArmourBonus([{ ...ablative, active: false }], 'leftLeg')).toBe(0);
    });
});

describe('installedEntry', () => {
    it('copies the category, the flat bonuses and only the locations that add something', () => {
        expect(installedEntry('uuid', 'Enhanced Ceramite Plating', mod('subsystem', { locations: { body: 2, head: 0, leftArm: null } }))).toEqual({
            uuid: 'uuid',
            name: 'Enhanced Ceramite Plating',
            active: true,
            category: 'subsystem',
            cachedModifiers: { armourPoints: 0, maxAgility: 0, subsystemSlots: 0, locations: { body: 2 } },
        });
    });
});
