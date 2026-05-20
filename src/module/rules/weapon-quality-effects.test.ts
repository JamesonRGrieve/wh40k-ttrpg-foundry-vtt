/**
 * Per-quality unit tests for the Phase 6 promotions on
 * `WEAPON_QUALITY_EFFECTS` (#57 completion). The umbrella registry test
 * lives in `weapon-quality-effects.umbrella.test.ts` and pins the
 * presence of every audit-listed key; this file covers the per-quality
 * resolver helpers introduced alongside the structured-payload
 * promotions (Blast, Concussive, Corrosive, Crippling, Flame, Flexible,
 * Graviton, Hallucinogenic, Haywire, Indirect, Lance, Maximal,
 * Overheats, Power Field, Primitive, Reliable, Sanctified, Scatter,
 * Shocking, Smoke, Snare, Spray, Toxic).
 */

import { describe, expect, it } from 'vitest';
import {
    resolveCripplingTickDamage,
    resolveGravitonBonusDamage,
    resolveHaywireRadius,
    resolveHitEffectSaveTarget,
    resolveIndirectPenalty,
    resolveLanceBonus,
    resolveMaximalEffect,
    resolvePowerFieldParryDestroys,
    resolvePrimitiveDamageAdjust,
    resolveScatterRangeBand,
    resolveStunDuration,
    resolveTemplateRadius,
    WEAPON_QUALITY_EFFECTS,
    type WeaponQualityHitEffect,
    type WeaponQualityRangeBands,
    type WeaponQualityTemplate,
} from './weapon-quality-effects.ts';

type QualityWeapon = Parameters<typeof resolvePowerFieldParryDestroys>[0];

function weaponWith(qualities: ReadonlyArray<string>): QualityWeapon {
    return { system: { special: new Set(qualities) } } as QualityWeapon;
}

describe('Blast (X) — template payload', () => {
    it('exposes a sphere template with variable radius', () => {
        const tpl = (WEAPON_QUALITY_EFFECTS.blast as { template: WeaponQualityTemplate }).template;
        expect(tpl.shape).toBe('sphere');
        expect(tpl.radiusVariable).toBe(true);
    });

    it('resolveTemplateRadius returns the X value, clamped at 0', () => {
        expect(resolveTemplateRadius(3)).toBe(3);
        expect(resolveTemplateRadius(0)).toBe(0);
        expect(resolveTemplateRadius(-2)).toBe(0);
    });
});

describe('Concussive (X) — Toughness test + DoF-scaled stun', () => {
    const hit = (WEAPON_QUALITY_EFFECTS.concussive as { hitEffect: WeaponQualityHitEffect }).hitEffect;

    it('requires a Toughness save with -10 per X', () => {
        expect(hit.requiresSave).toBe('toughness');
        expect(hit.saveTargetPenaltyPerLevel).toBe(-10);
        expect(hit.stunRoundsVariable).toBe(true);
    });

    it('penalises the save by X×10', () => {
        // Concussive (3) on T40 → 40 + (3 × -10) = 10
        expect(resolveHitEffectSaveTarget({ characteristicTotal: 40, key: 'concussive', level: 3 })).toBe(10);
    });

    it('floors the save target at 0 when penalty exceeds the characteristic', () => {
        expect(resolveHitEffectSaveTarget({ characteristicTotal: 20, key: 'concussive', level: 5 })).toBe(0);
    });

    it('stun rounds = DoF per RAW', () => {
        expect(resolveStunDuration({ dof: 3, key: 'concussive' })).toBe(3);
        expect(resolveStunDuration({ dof: 0, key: 'concussive' })).toBe(0);
    });
});

describe('Corrosive — armour-melt save', () => {
    it('promotes to hit-effect type with an armour-melt fail effect', () => {
        const entry = WEAPON_QUALITY_EFFECTS.corrosive as { type: string; hitEffect: WeaponQualityHitEffect; corrosiveArmourDice: string };
        expect(entry.type).toBe('hit-effect');
        expect(entry.hitEffect.failEffect).toBe('armour-melt');
        expect(entry.corrosiveArmourDice).toBe('1d10');
    });
});

describe('Crippling (X)', () => {
    it('emits X damage per round when the target acts beyond a Half Action', () => {
        expect(resolveCripplingTickDamage(2)).toBe(2);
        expect(resolveCripplingTickDamage(0)).toBe(0);
        expect(resolveCripplingTickDamage(-1)).toBe(0);
    });

    it('hit-effect tag is `crippled`', () => {
        const hit = (WEAPON_QUALITY_EFFECTS.crippling as { hitEffect: WeaponQualityHitEffect }).hitEffect;
        expect(hit.failEffect).toBe('crippled');
    });
});

describe('Flame — Agility test or burning', () => {
    it('promotes to a hit-effect that grants Burning on a failed Agility save', () => {
        const hit = (WEAPON_QUALITY_EFFECTS.flame as { hitEffect: WeaponQualityHitEffect }).hitEffect;
        expect(hit.requiresSave).toBe('agility');
        expect(hit.failEffect).toBe('burning');
    });
});

describe('Flexible — already parry-typed (regression guard)', () => {
    it('keeps cannotBeParried: true', () => {
        const entry = WEAPON_QUALITY_EFFECTS.flexible as { type: string; cannotBeParried: boolean };
        expect(entry.type).toBe('parry');
        expect(entry.cannotBeParried).toBe(true);
    });
});

describe('Graviton — Strength test, bonus armour damage', () => {
    it('exposes a Strength save with prone fail-effect', () => {
        const hit = (WEAPON_QUALITY_EFFECTS.graviton as { hitEffect: WeaponQualityHitEffect }).hitEffect;
        expect(hit.requiresSave).toBe('strength');
        expect(hit.failEffect).toBe('prone');
    });

    it('adds the struck-location armour points to damage', () => {
        expect(resolveGravitonBonusDamage(4)).toBe(4);
        expect(resolveGravitonBonusDamage(0)).toBe(0);
        expect(resolveGravitonBonusDamage(undefined)).toBe(0);
    });
});

describe('Hallucinogenic (X) — Toughness penalty scales with X', () => {
    it('penalises Toughness test by X×10', () => {
        expect(resolveHitEffectSaveTarget({ characteristicTotal: 40, key: 'hallucinogenic', level: 2 })).toBe(20);
        expect(resolveHitEffectSaveTarget({ characteristicTotal: 40, key: 'hallucinogenic', level: 0 })).toBe(40);
    });
});

describe('Haywire (X) — radius is X × 10 metres', () => {
    it('scales the field radius linearly with X', () => {
        expect(resolveHaywireRadius(1)).toBe(10);
        expect(resolveHaywireRadius(3)).toBe(30);
        expect(resolveHaywireRadius(0)).toBe(0);
    });
});

describe('Indirect (X) — BS penalty', () => {
    it('emits a -10 × X BS penalty', () => {
        expect(resolveIndirectPenalty(1)).toBe(-10);
        expect(resolveIndirectPenalty(3)).toBe(-30);
        expect(resolveIndirectPenalty(0)).toBe(0);
    });
});

describe('Lance — Pen × DoS', () => {
    it('0 DoS still yields a non-negative delta (DoS floor = 1)', () => {
        expect(resolveLanceBonus(5, 0)).toBe(0);
    });

    it('1 DoS = no bonus', () => {
        expect(resolveLanceBonus(5, 1)).toBe(0);
    });

    it('2 DoS = ×2 (base added once)', () => {
        expect(resolveLanceBonus(5, 2)).toBe(5);
    });

    it('5 DoS = ×5 (base added four times)', () => {
        expect(resolveLanceBonus(5, 5)).toBe(20);
    });
});

describe('Maximal — recharge / overheat package', () => {
    it('emits +2 penetration, +1d10 damage, and the follow-up tags', () => {
        const result = resolveMaximalEffect();
        expect(result.bonusPenetration).toBe(2);
        expect(result.bonusDamageDice).toBe('1d10');
        expect(result.appliesOverheats).toBe(true);
        expect(result.triggersRecharge).toBe(true);
    });
});

describe('Overheats — registry flag (no resolver needed)', () => {
    it('keeps the existing overheats:true flag for action-data.ts consumers', () => {
        const entry = WEAPON_QUALITY_EFFECTS.overheats as { overheats: boolean };
        expect(entry.overheats).toBe(true);
    });
});

describe('Power Field — parry destroys the parried weapon', () => {
    it('destroys an ordinary parrying weapon', () => {
        const pf = weaponWith(['power-field']);
        const ordinary = weaponWith([]);
        expect(resolvePowerFieldParryDestroys(pf, ordinary)).toBe(true);
    });

    it('does not destroy another Power Field weapon', () => {
        const pf = weaponWith(['power-field']);
        const pf2 = weaponWith(['power-field']);
        expect(resolvePowerFieldParryDestroys(pf, pf2)).toBe(false);
    });

    it('does not destroy a Force weapon', () => {
        const pf = weaponWith(['power-field']);
        const force = weaponWith(['force']);
        expect(resolvePowerFieldParryDestroys(pf, force)).toBe(false);
    });

    it('returns false when defender lacks Power Field', () => {
        const plain = weaponWith([]);
        const ordinary = weaponWith([]);
        expect(resolvePowerFieldParryDestroys(plain, ordinary)).toBe(false);
    });

    it('returns false on null/undefined inputs', () => {
        expect(resolvePowerFieldParryDestroys(undefined, undefined)).toBe(false);
        expect(resolvePowerFieldParryDestroys(null, null)).toBe(false);
    });
});

describe('Primitive (X) — damage die cap', () => {
    it('returns 0 when die ≤ cap (no adjustment)', () => {
        expect(resolvePrimitiveDamageAdjust(5, 5)).toBe(0);
        expect(resolvePrimitiveDamageAdjust(3, 5)).toBe(0);
    });

    it('returns the negative delta when die > cap', () => {
        // Die rolled 9, Primitive (7) → adjust = 7 - 9 = -2
        expect(resolvePrimitiveDamageAdjust(9, 7)).toBe(-2);
        expect(resolvePrimitiveDamageAdjust(10, 6)).toBe(-4);
    });
});

describe('Reliable — registry flag (jam logic lives in rules/weapon-jam.ts)', () => {
    it('keeps the reliable:true flag', () => {
        const entry = WEAPON_QUALITY_EFFECTS.reliable as { reliable: boolean };
        expect(entry.reliable).toBe(true);
    });
});

describe('Sanctified — registry flag (Daemons cannot ignore damage)', () => {
    it('keeps the ignoresDaemonResistance flag', () => {
        const entry = WEAPON_QUALITY_EFFECTS.sanctified as { ignoresDaemonResistance: boolean };
        expect(entry.ignoresDaemonResistance).toBe(true);
    });
});

describe('Scatter — range-banded damage', () => {
    it('exposes the canonical RAW bands', () => {
        const bands = (WEAPON_QUALITY_EFFECTS.scatter as { rangeBands: WeaponQualityRangeBands }).rangeBands;
        expect(bands.pointBlank).toBe(3);
        expect(bands.shortRange).toBe(0);
        expect(bands.standardRange).toBe(-3);
        expect(bands.longRange).toBe(-3);
        expect(bands.extremeRange).toBe(-3);
    });

    it('resolveScatterRangeBand picks the right delta', () => {
        expect(resolveScatterRangeBand('Point Blank')).toBe(3);
        expect(resolveScatterRangeBand('Short Range')).toBe(0);
        expect(resolveScatterRangeBand('Standard Range')).toBe(-3);
        expect(resolveScatterRangeBand('Long Range')).toBe(-3);
        expect(resolveScatterRangeBand('Extreme Range')).toBe(-3);
    });

    it('falls back to 0 for unknown / undefined range names', () => {
        expect(resolveScatterRangeBand(undefined)).toBe(0);
        expect(resolveScatterRangeBand('Out Of Range')).toBe(0);
    });
});

describe('Shocking — Toughness or 1 round stun, half DoF rule', () => {
    it('exposes the 1-round Stun and Fatigue rider', () => {
        const entry = WEAPON_QUALITY_EFFECTS.shocking as { hitEffect: WeaponQualityHitEffect; shockingAppliesFatigue: number };
        expect(entry.hitEffect.requiresSave).toBe('toughness');
        expect(entry.hitEffect.stunRounds).toBe(1);
        expect(entry.shockingAppliesFatigue).toBe(1);
    });

    it('stun rounds = ceil(DoF / 2) per RAW', () => {
        expect(resolveStunDuration({ dof: 1, key: 'shocking' })).toBe(1);
        expect(resolveStunDuration({ dof: 2, key: 'shocking' })).toBe(1);
        expect(resolveStunDuration({ dof: 3, key: 'shocking' })).toBe(2);
        expect(resolveStunDuration({ dof: 4, key: 'shocking' })).toBe(2);
        expect(resolveStunDuration({ dof: 0, key: 'shocking' })).toBe(0);
    });
});

describe('Smoke (X) — concealment cloud', () => {
    it('exposes a concealment-cloud template with variable radius', () => {
        const tpl = (WEAPON_QUALITY_EFFECTS.smoke as { template: WeaponQualityTemplate }).template;
        expect(tpl.shape).toBe('concealment-cloud');
        expect(tpl.radiusVariable).toBe(true);
    });
});

describe('Snare (X) — Agility penalty', () => {
    it('penalises Agility by X×10', () => {
        const hit = (WEAPON_QUALITY_EFFECTS.snare as { hitEffect: WeaponQualityHitEffect }).hitEffect;
        expect(hit.requiresSave).toBe('agility');
        expect(hit.saveTargetPenaltyPerLevel).toBe(-10);
        expect(resolveHitEffectSaveTarget({ characteristicTotal: 35, key: 'snare', level: 2 })).toBe(15);
    });
});

describe('Spray — cone template, Agility avoidance', () => {
    it('exposes a cone template with non-variable shape', () => {
        const entry = WEAPON_QUALITY_EFFECTS.spray as { template: WeaponQualityTemplate; sprayAvoidanceCharacteristic: string };
        expect(entry.template.shape).toBe('cone');
        expect(entry.template.radiusVariable).toBe(false);
        expect(entry.sprayAvoidanceCharacteristic).toBe('agility');
    });
});

describe('Toxic (X) — Toughness penalty, 1d10 additional damage', () => {
    it('Toughness test is penalised by X×10', () => {
        expect(resolveHitEffectSaveTarget({ characteristicTotal: 40, key: 'toxic', level: 4 })).toBe(0);
        expect(resolveHitEffectSaveTarget({ characteristicTotal: 40, key: 'toxic', level: 1 })).toBe(30);
    });

    it('exposes a 1d10 additional-damage dice expression', () => {
        const entry = WEAPON_QUALITY_EFFECTS.toxic as { toxicAdditionalDamageDice: string };
        expect(entry.toxicAdditionalDamageDice).toBe('1d10');
    });
});
