import { describe, expect, it } from 'vitest';
import { BINDING_STRENGTH_PROFILES, type BindingStrength } from './daemon-weapon';
import {
    DAEMON_WEAPON_ATTRIBUTE_TABLES,
    attributeAtRoll,
    rollDaemonWeaponAttributes,
    tableForAlignment,
    type DaemonWeaponAttributeTable,
} from './daemon-weapon-attributes';

/**
 * Contract tests for Daemon Weapon Attribute tables and the roller (#142).
 *
 * Pins:
 *  - every table covers the full 1-10 d10 range (no gaps, no overlaps);
 *  - aligned weapons route picks 2+ to their patron's table while pick 1
 *    is always rolled on the General table;
 *  - unaligned weapons roll every slot on the General table;
 *  - the number of slots tracks BINDING_STRENGTH_PROFILES[strength].attributes.
 */

const ALL_TABLES: readonly DaemonWeaponAttributeTable[] = ['general', 'khorne', 'nurgle', 'slaanesh', 'tzeentch'];

describe('DAEMON_WEAPON_ATTRIBUTE_TABLES coverage (#142, beyond.md L1651-1820)', () => {
    for (const table of ALL_TABLES) {
        it(`${table} covers every d10 face 1..10 exactly once`, () => {
            const entries = DAEMON_WEAPON_ATTRIBUTE_TABLES[table];
            const seen = new Set<number>();
            for (const entry of entries) {
                const [lo, hi] = entry.roll;
                expect(lo).toBeGreaterThanOrEqual(1);
                expect(hi).toBeLessThanOrEqual(10);
                expect(lo).toBeLessThanOrEqual(hi);
                for (let face = lo; face <= hi; face += 1) {
                    expect(seen.has(face), `${table} entry ${entry.id} duplicates face ${face}`).toBe(false);
                    seen.add(face);
                }
            }
            for (let face = 1; face <= 10; face += 1) {
                expect(seen.has(face), `${table} missing d10 face ${face}`).toBe(true);
            }
        });

        it(`${table} attributeAtRoll resolves every face to an entry`, () => {
            for (let face = 1; face <= 10; face += 1) {
                const entry = attributeAtRoll(table, face);
                expect(face).toBeGreaterThanOrEqual(entry.roll[0]);
                expect(face).toBeLessThanOrEqual(entry.roll[1]);
            }
        });
    }

    it('attributeAtRoll clamps out-of-band values to the table range', () => {
        expect(attributeAtRoll('khorne', 0).roll[0]).toBe(1);
        expect(attributeAtRoll('khorne', 99).roll[1]).toBe(10);
    });
});

describe('tableForAlignment routing', () => {
    it('routes each Chaos god to its own table', () => {
        expect(tableForAlignment('khorne')).toBe('khorne');
        expect(tableForAlignment('nurgle')).toBe('nurgle');
        expect(tableForAlignment('slaanesh')).toBe('slaanesh');
        expect(tableForAlignment('tzeentch')).toBe('tzeentch');
    });

    it('routes unaligned weapons back to the General table', () => {
        expect(tableForAlignment('unaligned')).toBe('general');
    });
});

describe('rollDaemonWeaponAttributes (#142)', () => {
    const STRENGTHS: readonly BindingStrength[] = ['minor', 'lesser', 'normal', 'greater', 'major'];

    for (const strength of STRENGTHS) {
        it(`rolls exactly ${BINDING_STRENGTH_PROFILES[strength].attributes} slot(s) for binding=${strength}`, () => {
            const result = rollDaemonWeaponAttributes('khorne', strength, () => 0); // forces roll 1 every slot
            expect(result.slots).toBe(BINDING_STRENGTH_PROFILES[strength].attributes);
            expect(result.picks).toHaveLength(BINDING_STRENGTH_PROFILES[strength].attributes);
        });
    }

    it('slot 1 always uses the General table even when alignment is set', () => {
        const result = rollDaemonWeaponAttributes('tzeentch', 'major', () => 0.5);
        const firstPick = result.picks[0];
        if (firstPick === undefined) throw new Error('expected at least one pick');
        expect(firstPick.table).toBe('general');
        for (const pick of result.picks.slice(1)) {
            expect(pick.table).toBe('tzeentch');
        }
    });

    it('unaligned weapons roll every slot on the General table', () => {
        const result = rollDaemonWeaponAttributes('unaligned', 'major', () => 0.9);
        for (const pick of result.picks) {
            expect(pick.table).toBe('general');
        }
    });

    it('honours the injected RNG (deterministic snapshot)', () => {
        // Sequence forces rolls: floor(0.05*10)+1=1, floor(0.15*10)+1=2, floor(0.95*10)+1=10
        const seq = [0.05, 0.15, 0.95];
        let idx = 0;
        const rng = (): number => seq[idx++ % seq.length] ?? 0;
        const result = rollDaemonWeaponAttributes('khorne', 'normal', rng);
        expect(result.picks.map((p) => p.roll)).toEqual([1, 2, 10]);
        const p0 = result.picks[0];
        const p1 = result.picks[1];
        const p2 = result.picks[2];
        if (p0 === undefined || p1 === undefined || p2 === undefined) throw new Error('expected three picks');
        expect(p0.table).toBe('general');
        expect(p1.table).toBe('khorne');
        expect(p2.table).toBe('khorne');
    });
});
