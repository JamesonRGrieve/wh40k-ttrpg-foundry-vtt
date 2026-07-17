import { describe, expect, it } from 'vitest';
import { buildCharacteristicFields, CHARACTERISTICS, CHARACTERISTIC_SHORT_TO_FULL } from './characteristics.ts';

describe('CHARACTERISTIC_SHORT_TO_FULL (#271)', () => {
    it('maps the Core Rulebook abbreviations to full schema keys', () => {
        expect(CHARACTERISTIC_SHORT_TO_FULL['WS']).toBe('weaponSkill');
        expect(CHARACTERISTIC_SHORT_TO_FULL['BS']).toBe('ballisticSkill');
        expect(CHARACTERISTIC_SHORT_TO_FULL['Fel']).toBe('fellowship');
    });

    it('includes Influence — the entry the PC-path map had dropped (#271 drift fix)', () => {
        expect(CHARACTERISTIC_SHORT_TO_FULL['Inf']).toBe('influence');
    });
});

describe('CHARACTERISTICS canonical table (#464)', () => {
    it('lists the ten characteristics in canonical order with matching label/short', () => {
        expect(CHARACTERISTICS).toEqual([
            { key: 'weaponSkill', label: 'Weapon Skill', short: 'WS' },
            { key: 'ballisticSkill', label: 'Ballistic Skill', short: 'BS' },
            { key: 'strength', label: 'Strength', short: 'S' },
            { key: 'toughness', label: 'Toughness', short: 'T' },
            { key: 'agility', label: 'Agility', short: 'Ag' },
            { key: 'intelligence', label: 'Intelligence', short: 'Int' },
            { key: 'perception', label: 'Perception', short: 'Per' },
            { key: 'willpower', label: 'Willpower', short: 'WP' },
            { key: 'fellowship', label: 'Fellowship', short: 'Fel' },
            { key: 'influence', label: 'Influence', short: 'Inf' },
        ]);
    });

    it('places influence last so influence-free models can filter it off the tail', () => {
        expect(CHARACTERISTICS[CHARACTERISTICS.length - 1]?.key).toBe('influence');
    });

    it('has no duplicate keys or shorts', () => {
        expect(new Set(CHARACTERISTICS.map((c) => c.key)).size).toBe(CHARACTERISTICS.length);
        expect(new Set(CHARACTERISTICS.map((c) => c.short)).size).toBe(CHARACTERISTICS.length);
    });
});

describe('buildCharacteristicFields (#464)', () => {
    // A stand-in for the per-model field factory: records the (label, short) it
    // was called with so we can assert the emitted key → field map directly,
    // without a live Foundry runtime.
    const recordFn = (label: string, short: string): { label: string; short: string } => ({ label, short });

    it('emits all ten characteristics (Influence included) by default — the NPC key set', () => {
        const block = buildCharacteristicFields(recordFn);
        expect(Object.keys(block)).toEqual([
            'weaponSkill',
            'ballisticSkill',
            'strength',
            'toughness',
            'agility',
            'intelligence',
            'perception',
            'willpower',
            'fellowship',
            'influence',
        ]);
    });

    it('omits Influence when includeInfluence is false — the creature / vehicle key set', () => {
        const block = buildCharacteristicFields(recordFn, { includeInfluence: false });
        expect(Object.keys(block)).toEqual([
            'weaponSkill',
            'ballisticSkill',
            'strength',
            'toughness',
            'agility',
            'intelligence',
            'perception',
            'willpower',
            'fellowship',
        ]);
        expect(Object.keys(block)).not.toContain('influence');
    });

    it('passes each characteristic its canonical label and short to the field factory', () => {
        const block = buildCharacteristicFields(recordFn);
        expect(block['weaponSkill']).toEqual({ label: 'Weapon Skill', short: 'WS' });
        expect(block['influence']).toEqual({ label: 'Influence', short: 'Inf' });
    });
});
