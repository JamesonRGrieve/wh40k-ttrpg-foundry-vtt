/**
 * Regression guard: a vehicle actor may only carry `system` keys its DataModel
 * declares, and must be statted.
 *
 * Foundry's `SchemaField.clean` silently DROPS any key the schema does not
 * declare. The stored JSON keeps it, the validator (before this rule) passed
 * it, and nothing renders it — a failure invisible at every layer except the
 * table. It cost the Sentinel Walker its entire weapon table (parked in
 * `system.parts`) and left all 85 RT ships blank (hull integrity under
 * `system.hull`, turret rating under `system.turrets`, and so on).
 *
 * The companion `vehicle-unstatted` rule catches the other tell: a craft with
 * no armour on any facing and no structural integrity was never sourced from a
 * stat block. It found seven RT "vehicles" that turned out to be Tau
 * battlesuits — printed as worn armour, and already correctly authored as
 * `armour` items in `rt-tau-items-armour`.
 */

import { describe, expect, it } from 'vitest';
import { type SchemaWarning, validateDocument } from '../src/packs/validate-schema.cjs';

/**
 * An authored pack `system` block. Deliberately open: feeding the validator keys
 * the schema does NOT declare is exactly what these fixtures exercise, so a
 * closed interface here would make the regression untestable.
 */
// eslint-disable-next-line no-restricted-syntax -- boundary: pack `_source` documents are authored JSON whose openness is the thing under test
type PackSystem = Record<string, unknown>;

/** A pack document as authored in `_source/*.json`. */
interface PackDocument {
    name: string;
    _id: string;
    type: string;
    system: PackSystem;
}

/** Run one document through the validator and return the rules it tripped. */
function rulesFor(doc: PackDocument): string[] {
    const warnings: SchemaWarning[] = [];
    validateDocument(doc, 'test.json', warnings);
    return warnings.map((w) => w.rule);
}

/** A minimally-valid terracraft: statted, and using only schema fields. */
function craft(system: PackSystem = {}): PackDocument {
    return {
        name: 'Test Craft',
        _id: 'TestCraftId00001',
        type: 'dh2-terracraft',
        system: {
            armour: { front: { value: 20 }, side: { value: 18 }, rear: { value: 15 } },
            integrity: { max: 25, value: 25, critical: 0 },
            description: { dh2: { value: '' } },
            // No `notes` — that field exists only on VoidcraftData, which is
            // itself worth knowing: the validator caught its absence here.
            source: { dh2: { provenance: 'raw', book: 'DH2: Core Rulebook', page: '1' } },
            ...system,
        },
    };
}

describe('vehicle-field-not-in-schema', () => {
    it('passes a craft whose system keys are all declared', () => {
        expect(rulesFor(craft())).not.toContain('vehicle-field-not-in-schema');
    });

    it('flags the Sentinel Walker defect — a weapon table under system.parts', () => {
        expect(rulesFor(craft({ parts: [{ name: 'Autocannon' }] }))).toContain('vehicle-field-not-in-schema');
    });

    it('flags the RT ship defect — hull integrity under system.hull', () => {
        const ship = {
            name: 'Test Ship',
            _id: 'TestShipId000001',
            type: 'rt-voidcraft',
            system: { hull: 60, armour: 19, notes: { rt: '' } },
        };
        expect(rulesFor(ship)).toContain('vehicle-field-not-in-schema');
    });

    it('accepts the aircraft-only altitude fields on an aircraft', () => {
        const air = { ...craft({ altitude: 'low', ceiling: 'high' }), type: 'dh2-aircraft' };
        expect(rulesFor(air)).not.toContain('vehicle-field-not-in-schema');
    });

    it('rejects those same fields on a terracraft', () => {
        expect(rulesFor(craft({ altitude: 'low' }))).toContain('vehicle-field-not-in-schema');
    });

    it('ignores non-vehicle documents entirely', () => {
        const weapon = { name: 'Autogun', _id: 'AutogunTestId001', type: 'weapon', system: { parts: [] } };
        expect(rulesFor(weapon)).not.toContain('vehicle-field-not-in-schema');
    });
});

describe('vehicle-enum-out-of-range', () => {
    it('passes the schema choices', () => {
        expect(rulesFor(craft({ type: 'tank', locomotion: 'tracked', vehicleClass: 'ground' }))).not.toContain('vehicle-enum-out-of-range');
    });

    it("flags a classification outside the choices — 103 craft said 'ground'", () => {
        expect(rulesFor(craft({ type: 'ground' }))).toContain('vehicle-enum-out-of-range');
    });

    it('flags a vehicleClass that is really a locomotion', () => {
        expect(rulesFor(craft({ vehicleClass: 'skimmer' }))).toContain('vehicle-enum-out-of-range');
    });

    it('accepts a blank Renown, which is every line but Deathwatch', () => {
        expect(rulesFor(craft({ renown: '' }))).not.toContain('vehicle-enum-out-of-range');
    });

    it('flags a Renown tier that is not one of the five', () => {
        expect(rulesFor(craft({ renown: 'legendary' }))).toContain('vehicle-enum-out-of-range');
    });
});

describe('vehicle-unstatted', () => {
    it('passes a craft with armour and integrity', () => {
        expect(rulesFor(craft())).not.toContain('vehicle-unstatted');
    });

    it('flags a craft with neither — the Tau battlesuit shells', () => {
        const empty = craft({
            armour: { front: { value: 0 }, side: { value: 0 }, rear: { value: 0 } },
            integrity: { max: 0, value: 0, critical: 0 },
        });
        expect(rulesFor(empty)).toContain('vehicle-unstatted');
    });

    it('accepts armour alone, for a craft the book gives no integrity', () => {
        const armourOnly = craft({ integrity: { max: 0, value: 0, critical: 0 } });
        expect(rulesFor(armourOnly)).not.toContain('vehicle-unstatted');
    });

    it('reads a voidcraft hull integrity through hullIntegrity, not integrity', () => {
        const ship = {
            name: 'Test Ship',
            _id: 'TestShipId000002',
            type: 'rt-voidcraft',
            system: { armour: 0, hullIntegrity: { max: 40, value: 40 }, notes: { rt: '' } },
        };
        expect(rulesFor(ship)).not.toContain('vehicle-unstatted');
    });
});
