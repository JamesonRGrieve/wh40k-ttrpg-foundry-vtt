import { describe, expect, it } from 'vitest';
import { clampModifierToCap } from '../rolls/roll-data';
import { COMBAT_CIRCUMSTANCE_MODIFIERS, getCombatModifier, getCombatModifiersForTarget, sumSelectedCombatModifiers } from './combat-circumstance-modifiers';

/**
 * Tests for the combat circumstance modifier registry (#121).
 *
 * Pin the RAW values from core.md §"Modifiers in Combat" (p.229-231)
 * so a future refactor cannot quietly drift the table. The registry is
 * the data foundation; dialog wiring is a follow-up.
 */
describe('COMBAT_CIRCUMSTANCE_MODIFIERS registry (#121)', () => {
    it('every entry has a stable kebab-case id, label, value, target, and source', () => {
        for (const mod of COMBAT_CIRCUMSTANCE_MODIFIERS) {
            expect(mod.id, `missing id on entry: ${mod.label}`).toMatch(/^[a-z][a-z0-9-]*$/);
            expect(mod.label.length).toBeGreaterThan(0);
            expect(Number.isFinite(mod.value)).toBe(true);
            expect(['bs', 'ws', 'bs-or-ws', 'evasion', 'stealth']).toContain(mod.appliesTo);
            expect(mod.source.length).toBeGreaterThan(0);
        }
    });

    it('all ids are unique', () => {
        const ids = new Set<string>();
        for (const mod of COMBAT_CIRCUMSTANCE_MODIFIERS) {
            expect(ids.has(mod.id), `duplicate id: ${mod.id}`).toBe(false);
            ids.add(mod.id);
        }
    });

    it('pins canonical RAW values for the most-cited modifiers', () => {
        expect(getCombatModifier('darkness-ranged')?.value).toBe(-30);
        expect(getCombatModifier('darkness-melee')?.value).toBe(-20);
        expect(getCombatModifier('extreme-range')?.value).toBe(-30);
        expect(getCombatModifier('long-range')?.value).toBe(-10);
        expect(getCombatModifier('short-range')?.value).toBe(10);
        expect(getCombatModifier('point-blank-range')?.value).toBe(30);
        expect(getCombatModifier('shooting-into-melee')?.value).toBe(-20);
        expect(getCombatModifier('fog-mist-smoke')?.value).toBe(-20);
        expect(getCombatModifier('ganging-up-2-1')?.value).toBe(10);
        expect(getCombatModifier('ganging-up-3-1')?.value).toBe(20);
        expect(getCombatModifier('higher-ground')?.value).toBe(10);
        expect(getCombatModifier('prone-target-melee')?.value).toBe(10);
        expect(getCombatModifier('prone-target-ranged')?.value).toBe(-10);
        expect(getCombatModifier('stunned-target')?.value).toBe(20);
        expect(getCombatModifier('unaware-target')?.value).toBe(30);
    });

    it('pins the full size ladder (Table 4-6)', () => {
        expect(getCombatModifier('size-miniscule')?.value).toBe(-30);
        expect(getCombatModifier('size-puny')?.value).toBe(-20);
        expect(getCombatModifier('size-scrawny')?.value).toBe(-10);
        expect(getCombatModifier('size-average')?.value).toBe(0);
        expect(getCombatModifier('size-hulking')?.value).toBe(10);
        expect(getCombatModifier('size-enormous')?.value).toBe(20);
        expect(getCombatModifier('size-massive')?.value).toBe(30);
    });
});

describe('getCombatModifier', () => {
    it('returns undefined for an unknown id', () => {
        expect(getCombatModifier('not-a-real-modifier')).toBeUndefined();
    });
});

describe('getCombatModifiersForTarget', () => {
    it('returns only ranged-relevant entries for "bs" (including bs-or-ws)', () => {
        const ranged = getCombatModifiersForTarget('bs');
        // BS-only entries
        expect(ranged.find((m) => m.id === 'extreme-range')).toBeDefined();
        expect(ranged.find((m) => m.id === 'shooting-into-melee')).toBeDefined();
        // bs-or-ws entries (Stunned, Unaware, Size ladder) should also appear
        expect(ranged.find((m) => m.id === 'stunned-target')).toBeDefined();
        expect(ranged.find((m) => m.id === 'unaware-target')).toBeDefined();
        expect(ranged.find((m) => m.id === 'size-massive')).toBeDefined();
        // WS-only entries should NOT appear
        expect(ranged.find((m) => m.id === 'higher-ground')).toBeUndefined();
        expect(ranged.find((m) => m.id === 'ganging-up-2-1')).toBeUndefined();
    });

    it('returns only stealth entries for "stealth"', () => {
        const stealth = getCombatModifiersForTarget('stealth');
        for (const mod of stealth) {
            expect(['stealth', 'bs-or-ws']).toContain(mod.appliesTo);
        }
        expect(stealth.find((m) => m.id === 'darkness-stealth')).toBeDefined();
    });
});

describe('sumSelectedCombatModifiers', () => {
    it('returns 0 for an empty selection', () => {
        expect(sumSelectedCombatModifiers([])).toBe(0);
    });

    it('sums the values of the selected modifiers', () => {
        // Sniper at Long Range firing into melee at an Unaware target:
        // long-range (-10) + shooting-into-melee (-20) + unaware (+30) = 0
        expect(sumSelectedCombatModifiers(['long-range', 'shooting-into-melee', 'unaware-target'])).toBe(0);
    });

    it('skips unknown ids silently', () => {
        // short-range (+10) + bogus (0) + higher-ground (+10) = +20
        expect(sumSelectedCombatModifiers(['short-range', 'bogus', 'higher-ground'])).toBe(20);
    });

    it('composes with the ±60 cap from #127 (point-blank + stunned + unaware = 80 → clamped to 60)', () => {
        const raw = sumSelectedCombatModifiers(['point-blank-range', 'stunned-target', 'unaware-target']);
        expect(raw).toBe(80);
        const { clamped, capFired } = clampModifierToCap(raw);
        expect(clamped).toBe(60);
        expect(capFired).toBe(true);
    });
});
