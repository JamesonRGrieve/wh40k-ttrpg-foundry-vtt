import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DynamicModifierEntry, GrantedEffectEntry } from '../data/shared/modifiers-template.ts';
import { invalidateCriticalDamageCache } from '../rules/critical-damage.ts';
import type { DynamicModifierItemLike } from '../rules/dynamic-modifiers.ts';
import type { TargetTagSource } from '../rules/situation-tags.ts';
import { AssignDamageData, type ActorLike } from './assign-damage-data.ts';
import { type AttackDataLike, Hit, resetInertTriggerReports } from './damage-data.ts';

/** Deterministic total the stubbed Roll resolves to for dice `valueFormula` hooks. */
const DICE_ROLL_TOTAL = 7;

/** Base weapon damage every target-conditional case starts from, so an applied hook is visible in the total. */
const BASE_DAMAGE = 5;

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

/** Everything the {@link attackData} factory can vary about one attack. */
interface AttackOpts {
    isMelee?: boolean;
    isRanged?: boolean;
    dos?: number;
    activated?: boolean;
    action?: string;
    /** The declared target, from which `situation.targetTags` is derived (#518). */
    target?: TargetTagSource | null;
    /** The computed range bracket, from which `situation.rangeBand` is derived. */
    rangeBracket?: string;
    /** Foundry status ids on the ATTACKER, from which `situation.states` is derived. */
    statuses?: string[];
    /** Active Effects on the attacker; a non-disabled one's name is also a state. */
    effects?: { name?: string; disabled?: boolean }[];
    /** Declared Aim bonus, which contributes the `aiming` state. */
    aim?: number;
}

/**
 * A minimal {@link AttackDataLike} whose source actor exposes fuzzy characteristic
 * bonuses (WeaponSkill 4, BallisticSkill 3, everything else 2) and the given owned
 * items. `opts` toggles the weapon's melee/ranged nature, the DoS, whether an
 * activation effect (Eye of Vengeance) is live, the combat action name, and the
 * situation inputs the target-conditional / state / range triggers read.
 */
function attackData(items: DynamicModifierItemLike[], opts: AttackOpts = {}): AttackDataLike {
    const bonus = (key: string): number => (key === 'WeaponSkill' ? 4 : key === 'BallisticSkill' ? 3 : 2);
    return {
        rollData: {
            weapon: { system: {}, isMelee: opts.isMelee ?? true, isRanged: opts.isRanged ?? false },
            sourceActor: {
                getCharacteristicFuzzy: (key: string) => ({ bonus: bonus(key) }),
                hasTalent: () => false,
                hasTalentFuzzyWords: () => false,
                items,
                statuses: opts.statuses,
                effects: opts.effects,
            },
            targetActor: opts.target,
            roll: null,
            action: opts.action ?? 'Standard Attack',
            rangeName: '',
            rangeBracket: opts.rangeBracket,
            modifiers: opts.aim === undefined ? undefined : { aim: opts.aim },
            attackSpecials: [],
            dos: opts.dos ?? 3,
            eyeOfVengeance: opts.activated ?? false,
            hasAttackSpecial: () => false,
            getAttackSpecial: () => ({ level: 0 }),
        },
    };
}

/**
 * Run one hit end-to-end from an authored hook to a committed damage total:
 * seed the base damage, apply the dynamic-modifier pass, then sum.
 *
 * Returning the TOTAL is the point. Asserting only on `hit.modifiers` lets an
 * empty tag list pass vacuously — "no entry" reads the same whether the hook was
 * correctly filtered out or the engine never had anything to test it against.
 * A total that did not move is an unambiguous failure.
 */
async function resolveDamage(hooks: DynamicModifierItemLike[], opts: AttackOpts): Promise<Hit> {
    const hit = new Hit();
    hit.damage = BASE_DAMAGE;
    await hit.applyDynamicModifiers(attackData(hooks, opts));
    hit._totalDamage();
    return hit;
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
/*  Target-conditional hooks — vsType / vsFaction / vsAlignment (#518)          */
/* -------------------------------------------------------------------------- */

/**
 * The sanctioned data-driven replacement for name-matching in `src/`. These cases
 * run the whole path — an authored hook on an owned item, a target ACTOR DOCUMENT
 * the tags are derived from, the situation the damage pipeline assembles, and the
 * committed damage total — because the defect they cover (#518) was invisible to
 * a test that only exercised the predicate against a hand-written tag array.
 */
describe('Hit.applyDynamicModifiers — target-conditional hooks (#518)', () => {
    /** A Khornate daemon NPC of the Blood Pact, carrying the Daemonic trait. */
    function daemonTarget(): TargetTagSource {
        return {
            type: 'dh2-npc',
            system: { nature: 'daemon', tier: 'elite', faction: 'Blood Pact', allegiance: 'Chaos', chaosAlignment: 'khorne' },
            items: [{ type: 'trait', name: 'Daemonic' }],
        };
    }

    /** An ordinary Ork raider — a target that matches none of the daemon-facing tags. */
    function orkTarget(): TargetTagSource {
        return {
            type: 'dh2-npc',
            system: { nature: 'xenos', tier: 'troop', faction: 'Freebooterz', allegiance: 'Xenos' },
            items: [{ type: 'trait', name: 'Brutal Charge' }],
        };
    }

    /** A damage hook gated on one target-tag axis, worth +4. */
    function vsHook(condition: 'vsType' | 'vsFaction' | 'vsAlignment', conditionValue: string): DynamicModifierItemLike {
        return item('Daemonbane', [makeHook({ target: 'damage', value: 4, condition, conditionValue })]);
    }

    it('applies a vsType hook against a daemon target and raises the committed damage total', async () => {
        const hit = await resolveDamage([vsHook('vsType', 'daemon')], { target: daemonTarget() });
        expect(hit.modifiers['daemonbane']).toBe(4);
        // The load-bearing assertion: a vacuously-empty tag list leaves this at BASE_DAMAGE.
        expect(hit.totalDamage).toBe(BASE_DAMAGE + 4);
    });

    it('does NOT apply the same hook against a target that lacks the tag', async () => {
        const hit = await resolveDamage([vsHook('vsType', 'daemon')], { target: orkTarget() });
        expect(hit.modifiers['daemonbane']).toBeUndefined();
        expect(hit.totalDamage).toBe(BASE_DAMAGE);
    });

    it('matches a tag contributed by an owned trait item, not just a schema enum', async () => {
        // `Daemonic` is a trait DOCUMENT on the target — the shape Hatred (Daemons)
        // used to name-match. Proves trait-derived tags reach the engine.
        const hit = await resolveDamage([vsHook('vsType', 'Daemonic')], { target: daemonTarget() });
        expect(hit.totalDamage).toBe(BASE_DAMAGE + 4);
    });

    it('applies a vsFaction hook from the target’s faction slot', async () => {
        const hit = await resolveDamage([vsHook('vsFaction', 'Blood Pact')], { target: daemonTarget() });
        expect(hit.totalDamage).toBe(BASE_DAMAGE + 4);
    });

    it('applies a vsAlignment hook from the target’s chaos alignment', async () => {
        const hit = await resolveDamage([vsHook('vsAlignment', 'khorne')], { target: daemonTarget() });
        expect(hit.totalDamage).toBe(BASE_DAMAGE + 4);
    });

    it('matches regardless of how the author spelled the value', async () => {
        for (const authored of ['Blood Pact', 'blood-pact', 'BLOOD  PACT']) {
            // eslint-disable-next-line no-await-in-loop -- sequential by design: one independent hit per authored spelling
            const hit = await resolveDamage([vsHook('vsFaction', authored)], { target: daemonTarget() });
            expect(hit.totalDamage).toBe(BASE_DAMAGE + 4);
        }
    });

    it('does not apply when the attack has no declared target', async () => {
        const hit = await resolveDamage([vsHook('vsType', 'daemon')], { target: null });
        expect(hit.totalDamage).toBe(BASE_DAMAGE);
    });

    it('keeps the axes separate — a faction value does not match on the type axis', async () => {
        const hit = await resolveDamage([vsHook('vsType', 'Blood Pact')], { target: daemonTarget() });
        expect(hit.totalDamage).toBe(BASE_DAMAGE);
    });

    it('routes a target-conditional hook to penetration as readily as to damage', async () => {
        const rending = item('Rending', [makeHook({ target: 'penetration', value: 3, condition: 'vsType', conditionValue: 'daemon' })]);
        const hit = new Hit();
        hit.penetration = 2;
        await hit.applyDynamicModifiers(attackData([rending], { target: daemonTarget() }));
        hit._totalPenetration();
        expect(hit.totalPenetration).toBe(5);
    });
});

/* -------------------------------------------------------------------------- */
/*  whileState / rangeBand — the other two situation inputs (#518)              */
/* -------------------------------------------------------------------------- */

describe('Hit.applyDynamicModifiers — state and range-band triggers (#518)', () => {
    /** A damage hook gated on the acting actor's state, worth +2. */
    const stateHook = (value: string): DynamicModifierItemLike =>
        item('Berserk', [makeHook({ target: 'damage', value: 2, condition: 'whileState', conditionValue: value })]);

    it('applies a whileState hook from a Foundry status on the attacker', async () => {
        const hit = await resolveDamage([stateHook('frenzy')], { statuses: ['frenzy'] });
        expect(hit.totalDamage).toBe(BASE_DAMAGE + 2);
    });

    it('applies a whileState hook from an active effect name on the attacker', async () => {
        const hit = await resolveDamage([stateHook('on-fire')], { effects: [{ name: 'On Fire' }] });
        expect(hit.totalDamage).toBe(BASE_DAMAGE + 2);
    });

    it('ignores a disabled effect — a suspended condition is not a live state', async () => {
        const hit = await resolveDamage([stateHook('frenzy')], { effects: [{ name: 'Frenzy', disabled: true }] });
        expect(hit.totalDamage).toBe(BASE_DAMAGE);
    });

    it('derives the aiming state from a declared Aim, which is a roll option rather than a condition', async () => {
        const aimed = await resolveDamage([stateHook('aiming')], { aim: 10 });
        expect(aimed.totalDamage).toBe(BASE_DAMAGE + 2);

        const unaimed = await resolveDamage([stateHook('aiming')], { aim: 0 });
        expect(unaimed.totalDamage).toBe(BASE_DAMAGE);
    });

    it('applies a rangeBand-conditioned hook at the computed bracket', async () => {
        const melta = item('Melta Surge', [makeHook({ target: 'damage', value: 6, condition: 'rangeBand', conditionValue: 'point-blank' })]);

        const close = await resolveDamage([melta], { isMelee: false, isRanged: true, rangeBracket: 'pointBlank' });
        expect(close.totalDamage).toBe(BASE_DAMAGE + 6);

        const far = await resolveDamage([melta], { isMelee: false, isRanged: true, rangeBracket: 'long' });
        expect(far.totalDamage).toBe(BASE_DAMAGE);
    });

    it('applies an atRangeBand-TIMED hook at the computed bracket', async () => {
        const sniper = item('Marksman', [makeHook({ target: 'damage', value: 3, when: 'atRangeBand', conditionValue: 'extreme' })]);

        const extreme = await resolveDamage([sniper], { isMelee: false, isRanged: true, rangeBracket: 'extreme' });
        expect(extreme.totalDamage).toBe(BASE_DAMAGE + 3);

        const standard = await resolveDamage([sniper], { isMelee: false, isRanged: true, rangeBracket: 'standard' });
        expect(standard.totalDamage).toBe(BASE_DAMAGE);
    });
});

/* -------------------------------------------------------------------------- */
/*  Inert-trigger warning — silence is the defect (#518)                        */
/* -------------------------------------------------------------------------- */

describe('Hit.applyDynamicModifiers — GM warning for triggers that can never match (#518)', () => {
    /** Capture `ui.notifications.warn` with a GM user in the chair. */
    function stubGmNotifications(): ReturnType<typeof vi.fn> {
        const warn = vi.fn();
        vi.stubGlobal('game', { user: { isGM: true }, i18n: { localize: (k: string) => k, format: (k: string) => k } });
        vi.stubGlobal('ui', { notifications: { warn } });
        return warn;
    }

    // The report memo is per-session in play; reset it so each case starts clean.
    beforeEach(() => resetInertTriggerReports());
    afterEach(() => vi.unstubAllGlobals());

    it('warns the GM when a vsType hook had no target tags to test against', async () => {
        const warn = stubGmNotifications();
        await resolveDamage([item('Daemonbane', [makeHook({ condition: 'vsType', conditionValue: 'daemon', value: 4 })])], { target: null });
        expect(warn).toHaveBeenCalledOnce();
    });

    it('stays quiet when the target simply does not carry the tag — that is correct play, not a bug', async () => {
        const warn = stubGmNotifications();
        const ork: TargetTagSource = { type: 'dh2-npc', system: { nature: 'xenos', faction: 'Freebooterz', allegiance: 'Xenos' } };
        await resolveDamage([item('Daemonbane', [makeHook({ condition: 'vsType', conditionValue: 'daemon', value: 4 })])], { target: ork });
        expect(warn).not.toHaveBeenCalled();
    });

    it('warns when a rangeBand hook fired on an attack that never computed a bracket', async () => {
        const warn = stubGmNotifications();
        await resolveDamage([item('Melta Surge', [makeHook({ condition: 'rangeBand', conditionValue: 'point-blank', value: 6 })])], {});
        expect(warn).toHaveBeenCalledOnce();
    });

    it('warns for a conditional GRANT with the same dead trigger, not only for numeric hooks', async () => {
        const warn = stubGmNotifications();
        const grant: DynamicModifierItemLike = {
            name: 'Daemon Slayer',
            system: {
                modifiers: {
                    grantedEffects: [
                        { kind: 'quality', name: 'Felling', uuid: '', level: 2, when: 'always', condition: 'vsFaction', conditionValue: 'Blood Pact' },
                    ],
                },
            },
        };
        await resolveDamage([grant], { target: null });
        expect(warn).toHaveBeenCalledOnce();
    });

    it('warns once per dead hook, not once per hit of a burst', async () => {
        const warn = stubGmNotifications();
        const dead = item('Daemonbane', [makeHook({ condition: 'vsType', conditionValue: 'daemon', value: 4 })]);
        for (let i = 0; i < 3; i += 1) {
            // eslint-disable-next-line no-await-in-loop -- sequential by design: three hits of one burst
            await resolveDamage([dead], { target: null });
        }
        expect(warn).toHaveBeenCalledOnce();
    });

    it('does not warn a player — the diagnostic is for whoever authored the content', async () => {
        const warn = vi.fn();
        vi.stubGlobal('game', { user: { isGM: false }, i18n: { localize: (k: string) => k, format: (k: string) => k } });
        vi.stubGlobal('ui', { notifications: { warn } });
        await resolveDamage([item('Daemonbane', [makeHook({ condition: 'vsType', conditionValue: 'daemon', value: 4 })])], { target: null });
        expect(warn).not.toHaveBeenCalled();
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
/*  Conditional grants — Hammer Blow → Concussive (2) (survey §D8)              */
/* -------------------------------------------------------------------------- */

describe('Hit._calculateSpecials — conditional quality grants (Direction #7, §D8)', () => {
    /** Build a complete {@link GrantedEffectEntry} with overrides. */
    function makeGrant(overrides: Partial<GrantedEffectEntry> = {}): GrantedEffectEntry {
        return { kind: 'quality', name: 'Concussive', uuid: '', level: 2, when: 'onAction', condition: '', conditionValue: 'All Out Attack', ...overrides };
    }

    /** An owned item exposing the given conditional grants. */
    function grantItem(name: string, grants: GrantedEffectEntry[]): DynamicModifierItemLike {
        return { name, system: { modifiers: { grantedEffects: grants } } };
    }

    /** The DH2/OW/BC Hammer Blow talent: Concussive (2) on an All-Out Attack. */
    const hammerBlow = (): DynamicModifierItemLike => grantItem('Hammer Blow', [makeGrant()]);

    it('pushes the granted quality onto the attack and resolves its hit effect', () => {
        const data = attackData([hammerBlow()], { isMelee: true, action: 'All Out Attack' });
        const hit = new Hit();
        hit._calculateSpecials(data);

        expect(data.rollData.attackSpecials).toEqual([{ name: 'Concussive', level: 2 }]);
        // Concussive's effect text is level-driven: level 2 → a −20 Toughness test.
        expect(hit.effects).toHaveLength(1);
        expect(hit.effects[0]?.name).toBe('Concussive');
        expect(hit.effects[0]?.effect).toContain('-20');
    });

    it('resolves a GRANTED Concussive (2) identically to one the weapon carries natively', () => {
        // The point of the channel: a granted quality is not a parallel implementation.
        // It lands in `attackSpecials` and flows through the same payload resolution,
        // so both routes must produce byte-identical effect output.
        const granted = new Hit();
        granted._calculateSpecials(attackData([hammerBlow()], { isMelee: true, action: 'All Out Attack' }));

        const nativeData = attackData([], { isMelee: true, action: 'Standard Attack' });
        nativeData.rollData.attackSpecials.push({ name: 'Concussive', level: 2 });
        const native = new Hit();
        native._calculateSpecials(nativeData);

        expect(granted.effects).toEqual(native.effects);
    });

    it('is inert when the gating action does not match (Standard Attack)', () => {
        const data = attackData([hammerBlow()], { isMelee: true, action: 'Standard Attack' });
        const hit = new Hit();
        hit._calculateSpecials(data);

        expect(data.rollData.attackSpecials).toEqual([]);
        expect(hit.effects).toEqual([]);
    });

    it('substitutes the authored level into the granted quality (DW Shocking, level 0)', () => {
        // Same talent, DW line → Shocking rather than Concussive. Proves the granted
        // name AND level come from content, not from a name-match in src/.
        const dw = grantItem('Hammer Blow', [makeGrant({ name: 'Shocking', level: 0 })]);
        const data = attackData([dw], { isMelee: true, action: 'All Out Attack' });
        const hit = new Hit();
        hit._calculateSpecials(data);

        expect(data.rollData.attackSpecials).toEqual([{ name: 'Shocking', level: 0 }]);
        expect(hit.effects[0]?.name).toBe('Shocking');
    });

    it('does not double-add a quality the weapon already carries', () => {
        const data = attackData([hammerBlow()], { isMelee: true, action: 'All Out Attack' });
        data.rollData.attackSpecials.push({ name: 'Concussive', level: 1 });
        const hit = new Hit();
        hit._calculateSpecials(data);

        // The weapon's own Concussive (1) stands; the grant does not stack a second entry.
        expect(data.rollData.attackSpecials).toEqual([{ name: 'Concussive', level: 1 }]);
    });

    it('gates a grant on the TARGET as readily as on the action (#518)', () => {
        // The grant pass builds its situation through the same builder as the
        // numeric pass, so a target-conditional grant is live too. Before #518 it
        // silently never fired, exactly like a `vsType` damage hook.
        const slayer = grantItem('Daemon Slayer', [makeGrant({ name: 'Felling', level: 2, when: 'always', conditionValue: 'daemon', condition: 'vsType' })]);
        const daemon: TargetTagSource = { type: 'dh2-npc', system: { nature: 'daemon' } };
        const ork: TargetTagSource = { type: 'dh2-npc', system: { nature: 'xenos' } };

        const matched = attackData([slayer], { isMelee: true, target: daemon });
        new Hit()._calculateSpecials(matched);
        expect(matched.rollData.attackSpecials).toEqual([{ name: 'Felling', level: 2 }]);

        const mismatched = attackData([slayer], { isMelee: true, target: ork });
        new Hit()._calculateSpecials(mismatched);
        expect(mismatched.rollData.attackSpecials).toEqual([]);
    });

    it('ignores a non-quality grant kind — it never becomes an attack special', () => {
        const talentGrant = grantItem('Some Talent', [
            makeGrant({ kind: 'talent', name: 'Berserk Charge', uuid: 'Compendium.wh40k-rpg.ow-core-items-talents.Item.abc', level: 0 }),
        ]);
        const data = attackData([talentGrant], { isMelee: true, action: 'All Out Attack' });
        const hit = new Hit();
        hit._calculateSpecials(data);

        expect(data.rollData.attackSpecials).toEqual([]);
        expect(hit.effects).toEqual([]);
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
