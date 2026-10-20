import { describe, expect, it } from 'vitest';
import type { SourcedVehicleTestModifier } from '../data/shared/vehicle-trait-effects-template.ts';
import {
    isVehicleTestCategory,
    VEHICLE_TEST_CATEGORIES,
    VEHICLE_TRAIT_TEST_BUCKET,
    vehicleTester,
    vehicleTestSkill,
    vehicleTraitTestComponents,
} from './vehicle-trait-tests.ts';

/** A Chimera-like craft's aggregated test modifiers: Rugged, Tracked Vehicle, Enhanced Motive Systems, Command and Control. */
const MODIFIERS: SourcedVehicleTestModifier[] = [
    { test: 'repair', value: 20, source: 'Rugged' },
    { test: 'difficultTerrain', value: 10, source: 'Tracked Vehicle' },
    { test: 'floorIt', value: 20, source: 'Enhanced Motive Systems' },
    { test: 'command', value: 10, source: 'Command and Control' },
    { test: 'repair', value: 0, source: 'Inert Trait' },
];

const describeSource = (trait: string): string => `Vehicle trait: ${trait}`;

describe('vehicleTraitTestComponents (Path B rows, content#28)', () => {
    it('sums under its own bucket', () => {
        expect(VEHICLE_TRAIT_TEST_BUCKET).toBe('vehicle-traits');
    });

    it('a Repair test takes Rugged, named, and skips a zero-valued entry', () => {
        expect(vehicleTraitTestComponents(MODIFIERS, 'repair', describeSource)).toEqual([
            { key: 'vehicle-trait-repair-0', label: 'Rugged', value: 20, source: 'Vehicle trait: Rugged' },
        ]);
    });

    it('a Difficult Terrain test takes Tracked Vehicle', () => {
        expect(vehicleTraitTestComponents(MODIFIERS, 'difficultTerrain', describeSource)).toEqual([
            { key: 'vehicle-trait-difficultTerrain-0', label: 'Tracked Vehicle', value: 10, source: 'Vehicle trait: Tracked Vehicle' },
        ]);
    });

    it('a Floor It! test takes Enhanced Motive Systems', () => {
        expect(vehicleTraitTestComponents(MODIFIERS, 'floorIt', describeSource)).toEqual([
            { key: 'vehicle-trait-floorIt-0', label: 'Enhanced Motive Systems', value: 20, source: 'Vehicle trait: Enhanced Motive Systems' },
        ]);
    });

    it('a Command test takes Command and Control', () => {
        expect(vehicleTraitTestComponents(MODIFIERS, 'command', describeSource)).toEqual([
            { key: 'vehicle-trait-command-0', label: 'Command and Control', value: 10, source: 'Vehicle trait: Command and Control' },
        ]);
    });

    it('two traits on one test give two rows, each with its own key and sign', () => {
        const rows = vehicleTraitTestComponents(
            [
                { test: 'difficultTerrain', value: 10, source: 'Tracked Vehicle' },
                { test: 'difficultTerrain', value: -20, source: 'Wheeled Vehicle' },
            ],
            'difficultTerrain',
            describeSource,
        );
        expect(rows.map((row) => [row.key, row.label, row.value])).toEqual([
            ['vehicle-trait-difficultTerrain-0', 'Tracked Vehicle', 10],
            ['vehicle-trait-difficultTerrain-1', 'Wheeled Vehicle', -20],
        ]);
    });

    it('gives no rows to a craft whose traits do not touch the test', () => {
        expect(vehicleTraitTestComponents([], 'repair', describeSource)).toEqual([]);
    });
});

describe('vehicleTestSkill', () => {
    const aptitudeLine = new Set(['techUse', 'operate', 'command']);
    const careerLine = new Set(['techUse', 'drive', 'pilot', 'command']);

    it('repairs are Tech-Use and command is Command in every line', () => {
        for (const line of [aptitudeLine, careerLine]) {
            expect(vehicleTestSkill('repair', (key) => line.has(key))).toBe('techUse');
            expect(vehicleTestSkill('command', (key) => line.has(key))).toBe('command');
        }
    });

    it('driving is Operate in the aptitude lines and Drive in the career lines', () => {
        expect(vehicleTestSkill('difficultTerrain', (key) => aptitudeLine.has(key))).toBe('operate');
        expect(vehicleTestSkill('floorIt', (key) => careerLine.has(key))).toBe('drive');
    });

    it('falls back to the first candidate when the tester has none of them', () => {
        expect(vehicleTestSkill('floorIt', () => false)).toBe('operate');
    });
});

describe('vehicleTester', () => {
    const occupants = [
        { actor: 'gunner', role: 'gunner' as const },
        { actor: 'crew', role: 'crew' as const },
        { actor: 'driver', role: 'driver' as const },
    ];

    it('crew make repairs; the driver drives and commands', () => {
        expect(vehicleTester('repair', occupants)).toBe('crew');
        expect(vehicleTester('difficultTerrain', occupants)).toBe('driver');
        expect(vehicleTester('floorIt', occupants)).toBe('driver');
        expect(vehicleTester('command', occupants)).toBe('driver');
    });

    it('falls through the seats, and never asks a passenger', () => {
        expect(vehicleTester('repair', [{ actor: 'driver', role: 'driver' as const }])).toBe('driver');
        expect(vehicleTester('floorIt', [{ actor: 'passenger', role: 'passenger' as const }])).toBeUndefined();
    });
});

describe('isVehicleTestCategory', () => {
    it('accepts the four categories and rejects anything else', () => {
        for (const category of VEHICLE_TEST_CATEGORIES) expect(isVehicleTestCategory(category)).toBe(true);
        expect(isVehicleTestCategory('manoeuvrability')).toBe(false);
    });
});
