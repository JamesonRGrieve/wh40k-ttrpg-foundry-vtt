/**
 * Per-quality unit tests for the weapon-quality mechanical payloads (#57 / #303).
 * The payloads now live on the weaponQuality compendium docs (`system.mechanics`)
 * rather than the former in-`src/` WEAPON_QUALITY_EFFECTS registry, so the
 * "registry-content" assertions read the real pack `_source` (via
 * `weaponQualityMechanicsFromRaw`, the same default-merge the boot index uses) and
 * the resolver helpers run against the index seeded from that same pack data.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { WeaponQualityMechanics } from '../data/item/weapon-quality-mechanics.ts';
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
} from './weapon-quality-effects.ts';
import { setWeaponQualityPayloadsForTesting, weaponQualityMechanicsFromRaw } from './weapon-quality-payloads.ts';

type QualityWeapon = Parameters<typeof resolvePowerFieldParryDestroys>[0];

function weaponWith(qualities: ReadonlyArray<string>): QualityWeapon {
    return { system: { special: new Set(qualities) } } as QualityWeapon;
}

// Read the real weaponQuality pack `_source` and build the by-identifier mechanics
// map the boot index would build, then seed the resolver index from it.
const PACK_DIR = resolve(__dirname, '../../packs/rogue-trader/rt-core-items-weapon-qualities/_source');
const mechanicsById = new Map<string, WeaponQualityMechanics>();
if (existsSync(PACK_DIR)) {
    for (const file of readdirSync(PACK_DIR).filter((f) => f.endsWith('.json'))) {
        const doc = JSON.parse(readFileSync(resolve(PACK_DIR, file), 'utf8')) as { system?: { identifier?: string; mechanics?: WeaponQualityMechanics } };
        const id = doc.system?.identifier;
        if (typeof id === 'string' && id !== '') mechanicsById.set(id.toLowerCase(), weaponQualityMechanicsFromRaw(doc.system?.mechanics));
    }
}

function mech(identifier: string): WeaponQualityMechanics {
    const m = mechanicsById.get(identifier);
    if (m === undefined) throw new Error(`weaponQuality pack has no doc for identifier "${identifier}"`);
    return m;
}

beforeAll(() => {
    setWeaponQualityPayloadsForTesting(Object.fromEntries(mechanicsById));
});

describe('weaponQuality pack is populated with mechanics', () => {
    it('finds the shipped weaponQuality pack', () => {
        // src/packs is a submodule; if unpopulated this guard is meaningless.
        expect(mechanicsById.size).toBeGreaterThan(0);
    });

    it('pins the RAW Righteous-Fury thresholds (Gauss=9, Vengeful=8)', () => {
        // The resolver-side lookup is covered in righteous-fury.test.ts; this guards
        // the pack content the boot index reads.
        expect(mech('gauss').rfThreshold).toBe(9);
        expect(mech('vengeful').rfThreshold).toBe(8);
    });

    it('pins the Category-B parry/attack scalars', () => {
        expect(mech('accurate').aimBonus).toBe(10);
        expect(mech('balanced').parryBonus).toBe(10);
        expect(mech('defensive').parryBonus).toBe(15);
        expect(mech('fast').enemyParryPenalty).toBe(-20);
        expect(mech('unbalanced').parryPenalty).toBe(-10);
    });
});

describe('Blast (X) — template payload', () => {
    it('exposes a sphere template with variable radius', () => {
        const tpl = mech('blast').template;
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
    it('requires a Toughness save with -10 per X', () => {
        const hit = mech('concussive').hitEffect;
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
        const entry = mech('corrosive');
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
        expect(mech('crippling').hitEffect.failEffect).toBe('crippled');
    });
});

describe('Flame — Agility test or burning', () => {
    it('promotes to a hit-effect that grants Burning on a failed Agility save', () => {
        const hit = mech('flame').hitEffect;
        expect(hit.requiresSave).toBe('agility');
        expect(hit.failEffect).toBe('burning');
    });
});

describe('Flexible — already parry-typed (regression guard)', () => {
    it('keeps cannotBeParried: true', () => {
        const entry = mech('flexible');
        expect(entry.type).toBe('parry');
        expect(entry.cannotBeParried).toBe(true);
    });
});

describe('Graviton — Strength test, bonus armour damage', () => {
    it('exposes a Strength save with prone fail-effect', () => {
        const hit = mech('graviton').hitEffect;
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
    it('keeps the overheats:true flag for action-data.ts consumers', () => {
        expect(mech('overheats').overheats).toBe(true);
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
        expect(mech('reliable').reliable).toBe(true);
    });
});

describe('Sanctified — registry flag (Daemons cannot ignore damage)', () => {
    it('keeps the ignoresDaemonResistance flag', () => {
        expect(mech('sanctified').ignoresDaemonResistance).toBe(true);
    });
});

describe('Scatter — range-banded damage', () => {
    it('exposes the canonical RAW bands', () => {
        const bands = mech('scatter').rangeBands;
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
        const entry = mech('shocking');
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
        const tpl = mech('smoke').template;
        expect(tpl.shape).toBe('concealment-cloud');
        expect(tpl.radiusVariable).toBe(true);
    });
});

describe('Snare (X) — Agility penalty', () => {
    it('penalises Agility by X×10', () => {
        const hit = mech('snare').hitEffect;
        expect(hit.requiresSave).toBe('agility');
        expect(hit.saveTargetPenaltyPerLevel).toBe(-10);
        expect(resolveHitEffectSaveTarget({ characteristicTotal: 35, key: 'snare', level: 2 })).toBe(15);
    });
});

describe('Spray — cone template, Agility avoidance', () => {
    it('exposes a cone template with non-variable shape', () => {
        const entry = mech('spray');
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
        expect(mech('toxic').toxicAdditionalDamageDice).toBe('1d10');
    });
});
