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
// eslint-disable-next-line no-restricted-syntax -- boundary: validate-schema.cjs is untyped CommonJS shipped alongside the packs
import validator from '../src/packs/validate-schema.cjs';

interface Warning {
    rule: string;
    file: string;
    detail: string;
}

const { validateDocument } = validator as {
    validateDocument: (doc: unknown, relFile: string, warnings: Warning[]) => void;
};

/** Run one document through the validator and return the rules it tripped. */
function rulesFor(doc: unknown): string[] {
    const warnings: Warning[] = [];
    validateDocument(doc, 'test.json', warnings);
    return warnings.map((w) => w.rule);
}

/** A minimally-valid terracraft: statted, and using only schema fields. */
function craft(system: Record<string, unknown> = {}): unknown {
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
        const air = craft({ altitude: 'low', ceiling: 'high' });
        (air as { type: string }).type = 'dh2-aircraft';
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
