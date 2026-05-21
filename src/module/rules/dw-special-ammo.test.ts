/**
 * Tests for Deathwatch Special-Issue Ammunition (#172).
 *
 * Exercises the registry membership, the RAW values per type, and the
 * conditional gating applied by {@link applyAmmoEffect} (Hellfire's
 * unarmored-only bonus in particular).
 */

import { describe, expect, it } from 'vitest';
import { DW_SPECIAL_AMMO_EFFECTS, DW_SPECIAL_AMMO_IDS, applyAmmoEffect, getAmmoEffect, type DwSpecialAmmoId } from './dw-special-ammo.ts';

describe('DW Special-Issue Ammunition registry', () => {
    it('registers all seven RAW ammunition types', () => {
        const expected: ReadonlyArray<DwSpecialAmmoId> = ['hellfire', 'kraken', 'metal-storm', 'tempest', 'stalker', 'vengeance', 'dragonfire'];
        for (const id of expected) {
            expect(DW_SPECIAL_AMMO_EFFECTS[id]).toBeDefined();
            expect(getAmmoEffect(id).id).toBe(id);
        }
        expect(DW_SPECIAL_AMMO_IDS).toHaveLength(expected.length);
    });
});

describe('Hellfire — +1d10 vs unarmored only', () => {
    it('grants +1d10 damage when the target is unarmored', () => {
        const result = applyAmmoEffect({
            baseDamage: 1,
            basePenetration: 5,
            ammoId: 'hellfire',
            targetUnarmored: true,
        });
        expect(result.effectiveDamageDiceBonus).toBe(1);
        expect(result.effectiveFlatDamageBonus).toBe(0);
        expect(result.effectivePenetrationBonus).toBe(0);
    });

    it('contributes nothing when the target is armored', () => {
        const result = applyAmmoEffect({
            baseDamage: 1,
            basePenetration: 5,
            ammoId: 'hellfire',
            targetUnarmored: false,
        });
        expect(result.effectiveDamageDiceBonus).toBe(0);
        expect(result.effectiveFlatDamageBonus).toBe(0);
        expect(result.effectivePenetrationBonus).toBe(0);
    });

    it('treats an omitted targetUnarmored flag as armored', () => {
        const result = applyAmmoEffect({
            baseDamage: 1,
            basePenetration: 5,
            ammoId: 'hellfire',
        });
        expect(result.effectiveDamageDiceBonus).toBe(0);
    });
});

describe('Kraken — +3 Penetration', () => {
    it('adds +3 Penetration unconditionally', () => {
        const armored = applyAmmoEffect({
            baseDamage: 1,
            basePenetration: 5,
            ammoId: 'kraken',
            targetUnarmored: false,
        });
        const unarmored = applyAmmoEffect({
            baseDamage: 1,
            basePenetration: 5,
            ammoId: 'kraken',
            targetUnarmored: true,
        });
        expect(armored.effectivePenetrationBonus).toBe(3);
        expect(unarmored.effectivePenetrationBonus).toBe(3);
        expect(armored.effectiveDamageDiceBonus).toBe(0);
        expect(armored.effectiveFlatDamageBonus).toBe(0);
    });
});

describe('Metal Storm — +1 hit per DoS', () => {
    it('grants +1 bonus hit per Degree of Success', () => {
        const result = applyAmmoEffect({
            baseDamage: 1,
            basePenetration: 0,
            ammoId: 'metal-storm',
        });
        expect(result.bonusHitsPerDoS).toBe(1);
        expect(result.effectiveDamageDiceBonus).toBe(0);
        expect(result.effectivePenetrationBonus).toBe(0);
    });
});

describe('Tempest — ignores energy fields', () => {
    it('sets ignoresEnergyFields and changes nothing else numerically', () => {
        const result = applyAmmoEffect({
            baseDamage: 1,
            basePenetration: 0,
            ammoId: 'tempest',
        });
        expect(result.ignoresEnergyFields).toBe(true);
        expect(result.ignoresCover).toBe(false);
        expect(result.effectiveDamageDiceBonus).toBe(0);
        expect(result.effectivePenetrationBonus).toBe(0);
    });
});

describe('Stalker — silent + Stealth bonus', () => {
    it('grants +10 to Stealth tests', () => {
        const result = applyAmmoEffect({
            baseDamage: 1,
            basePenetration: 0,
            ammoId: 'stalker',
        });
        expect(result.stealthBonus).toBe(10);
        expect(result.effectiveDamageDiceBonus).toBe(0);
        expect(result.fireDamage).toBe(false);
    });
});

describe('Vengeance — +2 damage, -1 reliability', () => {
    it('adds +2 flat damage and shifts reliability down by 1', () => {
        const result = applyAmmoEffect({
            baseDamage: 1,
            basePenetration: 0,
            ammoId: 'vengeance',
        });
        expect(result.effectiveFlatDamageBonus).toBe(2);
        expect(result.reliabilityShift).toBe(-1);
        expect(result.effectiveDamageDiceBonus).toBe(0);
    });
});

describe('Dragonfire — +1d10 Fire, ignores cover', () => {
    it('grants +1d10 fire damage and bypasses cover', () => {
        const result = applyAmmoEffect({
            baseDamage: 1,
            basePenetration: 0,
            ammoId: 'dragonfire',
        });
        expect(result.effectiveDamageDiceBonus).toBe(1);
        expect(result.ignoresCover).toBe(true);
        expect(result.fireDamage).toBe(true);
        expect(result.ignoresEnergyFields).toBe(false);
    });
});
