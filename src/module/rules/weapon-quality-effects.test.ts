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
import { weaponDestroysOnCriticalFail } from './weapon-destroy.ts';
import {
    applyKeepHighestToDie,
    collectWeaponQualityDieOps,
    type DieTermLike,
    resolveCripplingTickDamage,
    resolveGravitonBonusDamage,
    resolveHaywireRadius,
    resolveHitEffectSaveTarget,
    resolveIndirectPenalty,
    resolveLanceBonus,
    resolveMaximalEffect,
    resolvePowerFieldParryDestroys,
    resolvePrimitiveDamageAdjust,
    resolveProvenDamageAdjust,
    resolveDieOpDamageAdjust,
    resolveScatterRangeBand,
    resolveStunDuration,
    resolveTemplateRadius,
    weaponQualityIdentifierFromName,
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

describe('Scavenged — destroyOnCriticalFail', () => {
    it('pins the RAW destroy-on-crit-fail mechanic on the canonical Scavenged doc', () => {
        // The RT-core Scavenged doc is the #303 canonical; the six line stubs mirror it by ref.
        expect(mech('scavenged').destroyOnCriticalFail).toBe(true);
    });

    it('reports a Scavenged weapon as destroy-on-crit-fail (data-driven, no name-match)', () => {
        expect(weaponDestroysOnCriticalFail(weaponWith(['scavenged']))).toBe(true);
    });

    it('reports a plain weapon (or one with unrelated qualities) as not destroy-on-crit-fail', () => {
        expect(weaponDestroysOnCriticalFail(weaponWith([]))).toBe(false);
        expect(weaponDestroysOnCriticalFail(weaponWith(['tearing', 'balanced']))).toBe(false);
        expect(weaponDestroysOnCriticalFail(null)).toBe(false);
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

    it('is PER-DIE, so a multi-die weapon accumulates each qualifying die (#303)', () => {
        // 2d10 Primitive(7) rolling [9, 10]: each die is capped independently, so
        // the engine sums -2 + -3 = -5. The inline branch this replaced assigned
        // with `=` inside the per-die loop and kept only the last die's -3.
        const rolls = [9, 10];
        const total = rolls.reduce((sum, die) => sum + resolvePrimitiveDamageAdjust(die, 7), 0);
        expect(total).toBe(-5);
    });
});

describe('Proven (X) — damage die floor', () => {
    it('returns 0 when die >= floor (no adjustment)', () => {
        expect(resolveProvenDamageAdjust(5, 3)).toBe(0);
        expect(resolveProvenDamageAdjust(3, 3)).toBe(0);
    });

    it('returns the positive delta when die < floor', () => {
        // Die rolled 1, Proven (3) → adjust = 3 - 1 = +2
        expect(resolveProvenDamageAdjust(1, 3)).toBe(2);
        expect(resolveProvenDamageAdjust(2, 5)).toBe(3);
    });

    it('is PER-DIE, so a multi-die weapon accumulates each qualifying die (#303)', () => {
        // 2d10 Proven(3) rolling [1, 2] → +2 and +1 = +3.
        const rolls = [1, 2];
        const total = rolls.reduce((sum, die) => sum + resolveProvenDamageAdjust(die, 3), 0);
        expect(total).toBe(3);
    });

    it('clamps negative inputs rather than inverting the floor', () => {
        expect(resolveProvenDamageAdjust(-4, 3)).toBe(3);
        expect(resolveProvenDamageAdjust(2, -1)).toBe(0);
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

/* -------------------------------------------------------------------------- */
/*  Die operations (#303) — the descriptor that retired the name-matching      */
/* -------------------------------------------------------------------------- */

describe('weaponQualityIdentifierFromName', () => {
    it('collapses a display name to its pack identifier', () => {
        expect(weaponQualityIdentifierFromName('Tearing')).toBe('tearing');
        expect(weaponQualityIdentifierFromName('Razor Sharp')).toBe('razor-sharp');
        expect(weaponQualityIdentifierFromName('Twin-Linked')).toBe('twin-linked');
    });

    it('strips punctuation and edge separators (levelled variant names)', () => {
        expect(weaponQualityIdentifierFromName('Primitive (X)')).toBe('primitive-x');
        expect(weaponQualityIdentifierFromName('  Proven  ')).toBe('proven');
    });
});

describe('dieOps content is authored on the canonical RT docs (#303)', () => {
    it('Tearing declares a pre-evaluation keep-highest with one extra die', () => {
        expect(mech('tearing').dieOps).toEqual([
            { op: 'keepHighest', phase: 'preEvaluate', extraDice: 1, threshold: null, usesLevel: false, modifierKey: 'tearing' },
        ]);
    });

    it('Proven declares a levelled post-evaluation floor, on both the bare and (X) docs', () => {
        for (const id of ['proven', 'proven-x']) {
            const ops = mech(id).dieOps;
            expect(ops).toHaveLength(1);
            expect(ops[0]?.op).toBe('floor');
            expect(ops[0]?.phase).toBe('postEvaluate');
            expect(ops[0]?.usesLevel).toBe(true);
            expect(ops[0]?.modifierKey).toBe('proven');
        }
    });

    it('Primitive declares a levelled post-evaluation cap, on both the bare and (X) docs', () => {
        for (const id of ['primitive', 'primitive-x']) {
            const ops = mech(id).dieOps;
            expect(ops).toHaveLength(1);
            expect(ops[0]?.op).toBe('cap');
            expect(ops[0]?.phase).toBe('postEvaluate');
            expect(ops[0]?.usesLevel).toBe(true);
            expect(ops[0]?.modifierKey).toBe('primitive');
        }
    });

    it('leaves every other quality with an empty dieOps list', () => {
        expect(mech('accurate').dieOps).toEqual([]);
        expect(mech('melta').dieOps).toEqual([]);
    });
});

describe('collectWeaponQualityDieOps', () => {
    it('resolves Tearing to a pre-evaluation keep-highest op', () => {
        expect(collectWeaponQualityDieOps([{ name: 'Tearing' }])).toEqual([
            { quality: 'Tearing', op: 'keepHighest', phase: 'preEvaluate', extraDice: 1, threshold: 0, modifierKey: 'tearing' },
        ]);
    });

    it('substitutes the attack special’s (X) level as the floor / cap threshold', () => {
        expect(collectWeaponQualityDieOps([{ name: 'Proven', level: 3 }])).toEqual([
            { quality: 'Proven', op: 'floor', phase: 'postEvaluate', extraDice: 0, threshold: 3, modifierKey: 'proven' },
        ]);
        expect(collectWeaponQualityDieOps([{ name: 'Primitive', level: 7 }])).toEqual([
            { quality: 'Primitive', op: 'cap', phase: 'postEvaluate', extraDice: 0, threshold: 7, modifierKey: 'primitive' },
        ]);
    });

    it('drops a levelled floor / cap with no level in play rather than resolving a 0 threshold', () => {
        // A cap of 0 would reduce every damage die to nothing; an inert op is correct.
        expect(collectWeaponQualityDieOps([{ name: 'Primitive' }])).toEqual([]);
        expect(collectWeaponQualityDieOps([{ name: 'Proven', level: 0 }])).toEqual([]);
    });

    it('resolves a bare name through the sibling (X) doc when only that one is authored', () => {
        setWeaponQualityPayloadsForTesting({ 'felling-x': { dieOps: [{ op: 'cap', phase: 'postEvaluate', usesLevel: true, modifierKey: 'felling' }] } });
        expect(collectWeaponQualityDieOps([{ name: 'Felling', level: 2 }])).toEqual([
            { quality: 'Felling', op: 'cap', phase: 'postEvaluate', extraDice: 0, threshold: 2, modifierKey: 'felling' },
        ]);
        setWeaponQualityPayloadsForTesting(Object.fromEntries(mechanicsById));
    });

    it('falls back to the quality identifier when the descriptor names no modifier key', () => {
        setWeaponQualityPayloadsForTesting({ 'razor-sharp': { dieOps: [{ op: 'floor', phase: 'postEvaluate', threshold: 4 }] } });
        expect(collectWeaponQualityDieOps([{ name: 'Razor Sharp' }])[0]?.modifierKey).toBe('razor-sharp');
        setWeaponQualityPayloadsForTesting(Object.fromEntries(mechanicsById));
    });

    it('ignores qualities with no payload and qualities that declare no die ops', () => {
        expect(collectWeaponQualityDieOps([{ name: 'Not A Quality' }, { name: 'Accurate' }])).toEqual([]);
    });

    it('collects every declared op across a multi-quality weapon', () => {
        const ops = collectWeaponQualityDieOps([{ name: 'Tearing' }, { name: 'Proven', level: 3 }]);
        expect(ops.map((o) => o.op)).toEqual(['keepHighest', 'floor']);
    });
});

describe('applyKeepHighestToDie — Tearing term surgery', () => {
    function die(number: number, modifiers: string[] = []): DieTermLike {
        return { number, modifiers };
    }

    it('appends the extra die and keeps the original count highest', () => {
        const term = die(1);
        expect(applyKeepHighestToDie(term, 1)).toBe(true);
        expect(term).toEqual({ number: 2, modifiers: ['kh1'] });
    });

    it('keeps the ORIGINAL count on a multi-die weapon (2d10 → 3d10kh2)', () => {
        const term = die(2);
        applyKeepHighestToDie(term, 1);
        expect(term).toEqual({ number: 3, modifiers: ['kh2'] });
    });

    it('does not stack when the term already carries a kh modifier (double-apply guard)', () => {
        const term = die(2, ['kh1']);
        expect(applyKeepHighestToDie(term, 1)).toBe(false);
        expect(term).toEqual({ number: 2, modifiers: ['kh1'] });
    });

    it('is idempotent across repeated application', () => {
        const term = die(1);
        applyKeepHighestToDie(term, 1);
        applyKeepHighestToDie(term, 1);
        expect(term).toEqual({ number: 2, modifiers: ['kh1'] });
    });

    it('leaves unrelated modifiers alone and still applies', () => {
        const term = die(1, ['r1']);
        expect(applyKeepHighestToDie(term, 1)).toBe(true);
        expect(term).toEqual({ number: 2, modifiers: ['r1', 'kh1'] });
    });

    it('is a no-op for a zero-die term, a null count, or zero extra dice', () => {
        const empty = die(0);
        expect(applyKeepHighestToDie(empty, 1)).toBe(false);
        expect(empty).toEqual({ number: 0, modifiers: [] });

        const nullCount: DieTermLike = { number: null, modifiers: [] };
        expect(applyKeepHighestToDie(nullCount, 1)).toBe(false);

        const noExtra = die(2);
        expect(applyKeepHighestToDie(noExtra, 0)).toBe(false);
        expect(noExtra).toEqual({ number: 2, modifiers: [] });
    });
});

describe('resolveDieOpDamageAdjust — per-die accumulation across a multi-die weapon', () => {
    /** Sum the adjustments every op resolved for `special` contributes over `rolls` — what the engine's per-die loop does. */
    function totalAdjust(special: { name: string; level?: number }, rolls: number[]): number {
        const ops = collectWeaponQualityDieOps([special]);
        expect(ops.length).toBeGreaterThan(0);
        return ops.reduce((sum, op) => sum + rolls.reduce((dieSum, roll) => dieSum + resolveDieOpDamageAdjust(roll, op), 0), 0);
    }

    it('accumulates the Proven floor over every die below the threshold', () => {
        // 3d10 Proven(3) rolling [1, 2, 8] → +2 +1 +0 = +3
        expect(totalAdjust({ name: 'Proven', level: 3 }, [1, 2, 8])).toBe(3);
    });

    it('accumulates the Primitive cap over every die above the threshold', () => {
        // 3d10 Primitive(7) rolling [9, 10, 4] → -2 -3 +0 = -5
        expect(totalAdjust({ name: 'Primitive', level: 7 }, [9, 10, 4])).toBe(-5);
    });

    it('contributes nothing for a pre-evaluation keepHighest op', () => {
        expect(totalAdjust({ name: 'Tearing' }, [1, 10])).toBe(0);
    });
});
