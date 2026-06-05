import { describe, expect, it } from 'vitest';
import type { RollData } from '../rolls/roll-data.ts';
import { attackSpecials, attackSpecialsNames, calculateAttackSpecialAttackBonuses } from './attack-specials.ts';

/**
 * Coverage for the pure attack-special rules consumed by the roll layer
 * (rolls/roll-data.ts) — the surface #309's roll-layer dedup reshapes downstream.
 * `calculateAttackSpecialAttackBonuses` maps the special qualities on a weapon's
 * attack-special items into `specialModifiers`; this pins that mapping (Scatter
 * is range-gated, Accurate/Inaccurate are aim-gated, etc.) plus the static
 * special registry.
 *
 * The function reads only a narrow slice of RollData; the full type carries
 * Foundry-runtime deps unavailable under vitest, so a structural mock is cast to
 * it at the call site (the established idiom — see combat-actions-throw.test.ts).
 */

interface MockSpecialItem {
    isAttackSpecial: boolean;
    name: string;
}
interface MockRollData {
    weapon: { items: MockSpecialItem[] };
    specialModifiers: Record<string, number>;
    modifiers: Record<string, number>;
    rangeName?: string;
}

function special(name: string): MockSpecialItem {
    return { isAttackSpecial: true, name };
}

function run(opts: { specials: string[]; rangeName?: string; aim?: number }): Record<string, number> {
    const rollData: MockRollData = {
        weapon: { items: opts.specials.map(special) },
        specialModifiers: {},
        modifiers: opts.aim === undefined ? {} : { aim: opts.aim },
        ...(opts.rangeName === undefined ? {} : { rangeName: opts.rangeName }),
    };
    // eslint-disable-next-line no-restricted-syntax -- structural mock satisfies the narrow surface calculateAttackSpecialAttackBonuses reads; full RollData carries Foundry-runtime deps unavailable under vitest.
    calculateAttackSpecialAttackBonuses(rollData as unknown as RollData);
    return rollData.specialModifiers;
}

describe('attackSpecials registry', () => {
    it('lists every special with a unique name', () => {
        const names = attackSpecials().map((s) => s.name);
        expect(names.length).toBeGreaterThan(0);
        expect(new Set(names).size).toBe(names.length);
    });

    it('flags level-bearing specials correctly', () => {
        const byName = new Map(attackSpecials().map((s) => [s.name, s.hasLevel]));
        expect(byName.get('Blast')).toBe(true); // Blast (X)
        expect(byName.get('Proven')).toBe(true); // Proven (X)
        expect(byName.get('Accurate')).toBe(false);
        expect(byName.get('Twin-Linked')).toBe(false);
    });

    it('attackSpecialsNames mirrors the registry names', () => {
        expect(attackSpecialsNames()).toEqual(attackSpecials().map((s) => s.name));
    });
});

describe('calculateAttackSpecialAttackBonuses', () => {
    it('Scatter grants +10 at Point Blank / Short Range only', () => {
        expect(run({ specials: ['Scatter'], rangeName: 'Point Blank' })['Scatter']).toBe(10);
        expect(run({ specials: ['Scatter'], rangeName: 'Short Range' })['Scatter']).toBe(10);
        expect(run({ specials: ['Scatter'], rangeName: 'Long Range' })['Scatter']).toBeUndefined();
    });

    it('Indirect grants a flat +10', () => {
        expect(run({ specials: ['Indirect'] })['Indirect']).toBe(10);
    });

    it('Twin-Linked grants +20', () => {
        expect(run({ specials: ['Twin-Linked'] })['Twin-Linked']).toBe(20);
    });

    it('Defensive applies -10', () => {
        expect(run({ specials: ['Defensive'] })['Defensive']).toBe(-10);
    });

    it('Accurate grants +10 only when aiming', () => {
        expect(run({ specials: ['Accurate'], aim: 10 })['Accurate']).toBe(10);
        expect(run({ specials: ['Accurate'], aim: 0 })['Accurate']).toBeUndefined();
    });

    it('Inaccurate cancels the aim bonus (penalty equal to -aim) only when aiming', () => {
        expect(run({ specials: ['Inaccurate'], aim: 10 })['Inaccurate']).toBe(-10);
        expect(run({ specials: ['Inaccurate'], aim: 0 })['Inaccurate']).toBeUndefined();
    });

    it('ignores items that are not attack specials', () => {
        const rollData: MockRollData = {
            weapon: { items: [{ isAttackSpecial: false, name: 'Twin-Linked' }] },
            specialModifiers: {},
            modifiers: {},
        };
        // eslint-disable-next-line no-restricted-syntax -- structural mock satisfies the narrow surface calculateAttackSpecialAttackBonuses reads; full RollData carries Foundry-runtime deps unavailable under vitest.
        calculateAttackSpecialAttackBonuses(rollData as unknown as RollData);
        expect(rollData.specialModifiers).toEqual({});
    });

    it('resets specialModifiers on each call', () => {
        const rollData: MockRollData = {
            weapon: { items: [special('Twin-Linked')] },
            specialModifiers: { Stale: 99 },
            modifiers: {},
        };
        // eslint-disable-next-line no-restricted-syntax -- structural mock satisfies the narrow surface calculateAttackSpecialAttackBonuses reads; full RollData carries Foundry-runtime deps unavailable under vitest.
        calculateAttackSpecialAttackBonuses(rollData as unknown as RollData);
        expect(rollData.specialModifiers['Stale']).toBeUndefined();
        expect(rollData.specialModifiers['Twin-Linked']).toBe(20);
    });
});
