import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DynamicModifierEntry } from '../data/shared/modifiers-template.ts';
import { invalidateCriticalDamageCache } from '../rules/critical-damage.ts';
import type { DynamicModifierItemLike } from '../rules/dynamic-modifiers.ts';
import { AssignDamageData, type ActorLike } from './assign-damage-data.ts';
import { type AttackDataLike, Hit } from './damage-data.ts';

/** Deterministic total the stubbed Roll resolves to for dice `valueFormula` hooks. */
const DICE_ROLL_TOTAL = 7;

/* -------------------------------------------------------------------------- */
/*  Shared factories — full DynamicModifierEntry + item/attackData/actor       */
/* -------------------------------------------------------------------------- */

/** Build a complete `scale` descriptor (all fields) with overrides. */
function scale(o: Partial<DynamicModifierEntry['scale']> = {}): DynamicModifierEntry['scale'] {
    return { source: '', field: 'bonus', factor: 1, round: 'up', multiplier: '', min: null, max: null, ...o };
}

/**
 * Build a complete {@link DynamicModifierEntry} (every field populated) with
 * overrides. Defaults to an attacker-side additive `damage` hook that always fires.
 */
function makeHook(overrides: Partial<DynamicModifierEntry> = {}): DynamicModifierEntry {
    return {
        target: 'damage',
        targetKey: '',
        side: 'attacker',
        mode: 'add',
        value: 0,
        valueFormula: '',
        scale: scale(),
        when: 'always',
        condition: '',
        conditionValue: '',
        duration: {
            unit: 'instant',
            value: 0,
            valueFormula: '',
            sustained: false,
            upkeep: '',
            stacking: 'none',
            save: { characteristic: '', difficulty: 0 },
            aftereffect: { target: 'characteristic', targetKey: '', value: 0, valueFormula: '', durationUnit: 'instant', durationValue: 0 },
        },
        formula: '',
        label: '',
        ...overrides,
    };
}

/** An owned item exposing the given dynamic-modifier hooks. */
function item(name: string, hooks: DynamicModifierEntry[]): DynamicModifierItemLike {
    return { name, system: { modifiers: { dynamicModifiers: hooks } } };
}

/**
 * A minimal {@link AttackDataLike} whose source actor exposes fuzzy characteristic
 * bonuses (WeaponSkill 4, BallisticSkill 3, everything else 2) and the given owned
 * items. `opts` toggles the weapon's melee/ranged nature, the DoS, whether an
 * activation effect (Eye of Vengeance) is live, and the combat action name.
 */
function attackData(
    items: DynamicModifierItemLike[],
    opts: { isMelee?: boolean; isRanged?: boolean; dos?: number; activated?: boolean; action?: string } = {},
): AttackDataLike {
    const bonus = (key: string): number => (key === 'WeaponSkill' ? 4 : key === 'BallisticSkill' ? 3 : 2);
    return {
        rollData: {
            weapon: { system: {}, isMelee: opts.isMelee ?? true, isRanged: opts.isRanged ?? false },
            sourceActor: {
                getCharacteristicFuzzy: (key: string) => ({ bonus: bonus(key) }),
                hasTalent: () => false,
                hasTalentFuzzyWords: () => false,
                items,
            },
            roll: null,
            action: opts.action ?? 'Standard Attack',
            rangeName: '',
            attackSpecials: [],
            dos: opts.dos ?? 3,
            eyeOfVengeance: opts.activated ?? false,
            hasAttackSpecial: () => false,
            getAttackSpecial: () => ({ level: 0 }),
        },
    };
}

/** Mark a Hit as having triggered Righteous Fury so `onCrit`-timed hooks fire. */
function withCrit(hit: Hit): Hit {
    // Hit.applyDynamicModifiers derives `situation.isCrit` solely from
    // `righteousFury.length > 0`; a structural stub for the Roll suffices.
    // eslint-disable-next-line no-restricted-syntax -- boundary: only righteousFury.length is read; the entry's Roll is never touched
    hit.righteousFury = [{ roll: {} as unknown as Hit['righteousFury'][number]['roll'], effect: '' }];
    return hit;
}

/* -------------------------------------------------------------------------- */
/*  Attacker side — Hit.applyDynamicModifiers wired into the damage pipeline    */
/* -------------------------------------------------------------------------- */

describe('Hit.applyDynamicModifiers — attacker damage/penetration hooks (Direction #7)', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('scales a melee half-WSB damage hook into the damage map (Crushing Blow shape)', async () => {
        const crushing = item('Crushing Blow', [makeHook({ target: 'damage', condition: 'melee', scale: scale({ source: 'ws', factor: 0.5, round: 'up' }) })]);
        const hit = new Hit();
        await hit.applyDynamicModifiers(attackData([crushing], { isMelee: true }));
        expect(hit.modifiers['crushing blow']).toBe(2); // ceil(WSB 4 × 0.5)
    });

    it('scales a ranged half-BSB damage hook only on a ranged attack (Mighty Shot shape)', async () => {
        const mighty = item('Mighty Shot', [makeHook({ target: 'damage', condition: 'ranged', scale: scale({ source: 'bs', factor: 0.5, round: 'up' }) })]);

        const ranged = new Hit();
        await ranged.applyDynamicModifiers(attackData([mighty], { isMelee: false, isRanged: true }));
        expect(ranged.modifiers['mighty shot']).toBe(2); // ceil(BSB 3 × 0.5)

        const melee = new Hit();
        await melee.applyDynamicModifiers(attackData([mighty], { isMelee: true, isRanged: false }));
        expect(melee.modifiers['mighty shot']).toBeUndefined();
    });

    it('routes a scaled penetration hook into the penetration map (Hammer Blow shape)', async () => {
        const hammer = item('Hammer Blow', [makeHook({ target: 'penetration', scale: scale({ source: 's', factor: 0.5, round: 'up' }) })]);
        const hit = new Hit();
        await hit.applyDynamicModifiers(attackData([hammer]));
        expect(hit.penetrationModifiers['hammer blow']).toBe(1); // ceil(SB 2 × 0.5)
    });

    it('scales a full-Perception-bonus damage hook (Deathdealer shape)', async () => {
        const deathdealer = item('Deathdealer', [makeHook({ target: 'damage', scale: scale({ source: 'per', factor: 1, round: 'none' }) })]);
        const hit = new Hit();
        await hit.applyDynamicModifiers(attackData([deathdealer]));
        expect(hit.modifiers['deathdealer']).toBe(2); // PerB 2 × 1
    });

    it('applies a multiply-mode penetration hook as base × (value − 1) (Melta pen×2 shape)', async () => {
        const melta = item('Melta', [makeHook({ target: 'penetration', mode: 'multiply', value: 2 })]);
        const hit = new Hit();
        hit.penetration = 6;
        await hit.applyDynamicModifiers(attackData([melta]));
        // delta = 6 × (2 − 1) = 6 → total penetration 12
        expect(hit.penetrationModifiers['melta']).toBe(6);
    });

    it('rolls a dice valueFormula hook and merges its total (ammo blessing shape)', async () => {
        // Hit.applyDynamicModifiers evaluates the hook's `valueFormula` via a Roll;
        // stub the global so the magnitude is deterministic (7).
        vi.stubGlobal('Roll', RollStub);
        const blessed = item('Blessed Ammo', [makeHook({ target: 'damage', valueFormula: '1d10' })]);
        const hit = new Hit();
        await hit.applyDynamicModifiers(attackData([blessed]));
        expect(hit.modifiers['blessed ammo']).toBe(DICE_ROLL_TOTAL);
    });

    it('applies an activation-gated hook (Eye of Vengeance +DoS) only when activated', async () => {
        const eov = item('Eye of Vengeance', [
            makeHook({ target: 'damage', condition: 'activated', conditionValue: 'eyeOfVengeance', scale: scale({ source: 'dos', factor: 1, round: 'none' }) }),
        ]);

        const inert = new Hit();
        await inert.applyDynamicModifiers(attackData([eov], { isRanged: true, isMelee: false, dos: 3, activated: false }));
        expect(inert.modifiers['eye of vengeance']).toBeUndefined();

        const live = new Hit();
        await live.applyDynamicModifiers(attackData([eov], { isRanged: true, isMelee: false, dos: 3, activated: true }));
        expect(live.modifiers['eye of vengeance']).toBe(3); // +DoS
    });

    it('gates an onCrit-timed hook on a Righteous Fury trigger being present', async () => {
        const rampage = item('Rampage', [makeHook({ target: 'damage', when: 'onCrit', value: 5 })]);

        const noCrit = new Hit();
        await noCrit.applyDynamicModifiers(attackData([rampage]));
        expect(noCrit.modifiers['rampage']).toBeUndefined();

        const crit = withCrit(new Hit());
        await crit.applyDynamicModifiers(attackData([rampage]));
        expect(crit.modifiers['rampage']).toBe(5);
    });

    it('gates an onAction-timed hook on the matching combat action', async () => {
        const smite = item('All-Out Smite', [makeHook({ target: 'damage', when: 'onAction', conditionValue: 'All Out Attack', value: 4 })]);

        const matched = new Hit();
        await matched.applyDynamicModifiers(attackData([smite], { action: 'All Out Attack' }));
        expect(matched.modifiers['all-out smite']).toBe(4);

        const mismatched = new Hit();
        await mismatched.applyDynamicModifiers(attackData([smite], { action: 'Standard Attack' }));
        expect(mismatched.modifiers['all-out smite']).toBeUndefined();
    });

    it('skips min/max-mode hooks (stat clamps, not damage deltas)', async () => {
        const capped = item('Damage Cap', [makeHook({ target: 'damage', mode: 'max', value: 3 }), makeHook({ target: 'penetration', mode: 'min', value: 1 })]);
        const hit = new Hit();
        await hit.applyDynamicModifiers(attackData([capped]));
        expect(Object.keys(hit.modifiers)).toEqual([]);
        expect(Object.keys(hit.penetrationModifiers)).toEqual([]);
    });

    it('is a no-op for hookless items', async () => {
        const bare: DynamicModifierItemLike = { name: 'Plain Sword', system: {} };
        const hit = new Hit();
        await hit.applyDynamicModifiers(attackData([bare]));
        expect(Object.keys(hit.modifiers)).toEqual([]);
        expect(Object.keys(hit.penetrationModifiers)).toEqual([]);
    });
});

/* -------------------------------------------------------------------------- */
/*  Defender side — AssignDamageData crit-reduction hooks (Direction #7)        */
/* -------------------------------------------------------------------------- */

describe('AssignDamageData — defender-side crit-reduction hooks (Direction #7)', () => {
    beforeEach(() => vi.stubGlobal('game', { packs: { get: () => undefined } }));
    afterEach(() => {
        invalidateCriticalDamageCache();
        vi.unstubAllGlobals();
    });

    /**
     * Actor with zero location armour and 2 wounds, so a 10-damage body hit
     * overflows: reducedDamage 7 → 2 wounds + 5 critical (before reduction).
     * Body location Toughness Bonus is 3, which the True-Grit hook reads.
     */
    function critActor(items?: DynamicModifierItemLike[]): ActorLike {
        const actor: ActorLike = {
            system: {
                armour: { BODY: { value: 0, toughnessBonus: 3 }, HEAD: { value: 0, toughnessBonus: 3 } },
                wounds: { value: 2, critical: 0 },
                fatigue: { value: 0 },
            },
            hasTalent: () => false,
            update: vi.fn<ActorLike['update']>().mockResolvedValue(undefined),
            createEmbeddedDocuments: vi.fn<ActorLike['createEmbeddedDocuments']>().mockResolvedValue(undefined),
        };
        if (items !== undefined) actor.items = items;
        return actor;
    }

    function critHit(): { location: string; damageType: string; totalDamage: number; totalPenetration: number; totalFatigue: number } {
        return { location: 'Body', damageType: 'Impact', totalDamage: 10, totalPenetration: 0, totalFatigue: 0 };
    }

    /** True Grit shape: defender-side crit reduction scaled by Toughness Bonus. */
    function trueGrit(): DynamicModifierItemLike {
        return {
            name: 'True Grit',
            system: {
                modifiers: {
                    dynamicModifiers: [
                        makeHook({ target: 'critReduction', side: 'defender', when: 'onCrit', scale: scale({ source: 't', factor: 1, round: 'up' }) }),
                    ],
                },
            },
        };
    }

    /** A static-value defender crit-reduction hook (no scaling). */
    function flatCritReduction(name: string, value: number): DynamicModifierItemLike {
        return { name, system: { modifiers: { dynamicModifiers: [makeHook({ target: 'critReduction', side: 'defender', when: 'onCrit', value })] } } };
    }

    it('reduces critical damage by the hook value (Toughness Bonus), floored above nothing', async () => {
        const data = new AssignDamageData(critActor([trueGrit()]), critHit());
        data.update();
        await data.finalize();
        // 5 crit − TB(3) = 2.
        expect(data.criticalDamageTaken).toBe(2);
    });

    it('takes the full critical damage when no crit-reduction hook is present', async () => {
        const data = new AssignDamageData(critActor(), critHit());
        data.update();
        await data.finalize();
        expect(data.criticalDamageTaken).toBe(5);
    });

    it('takes the full critical damage when the actor exposes no items at all', async () => {
        const data = new AssignDamageData(critActor(undefined), critHit());
        data.update();
        await data.finalize();
        expect(data.criticalDamageTaken).toBe(5);
    });

    it('sums multiple crit-reduction hooks', async () => {
        const data = new AssignDamageData(critActor([flatCritReduction('Daemonic', 1), flatCritReduction('Warded', 1)]), critHit());
        data.update();
        await data.finalize();
        // 5 crit − (1 + 1) = 3.
        expect(data.criticalDamageTaken).toBe(3);
    });

    it('floors reduced critical damage at 1 even when the reduction exceeds it', async () => {
        const data = new AssignDamageData(critActor([flatCritReduction('Impervious', 10)]), critHit());
        data.update();
        await data.finalize();
        // 5 crit − 10 = −5 → floored to 1.
        expect(data.criticalDamageTaken).toBe(1);
    });
});

/* -------------------------------------------------------------------------- */
/*  Roll stub — deterministic magnitude for dice `valueFormula` hooks           */
/* -------------------------------------------------------------------------- */

/** Minimal stand-in for Foundry's Roll: `evaluate()` resolves with a fixed total. */
class RollStub {
    total = DICE_ROLL_TOTAL;
    async evaluate(): Promise<this> {
        return Promise.resolve(this);
    }
}
