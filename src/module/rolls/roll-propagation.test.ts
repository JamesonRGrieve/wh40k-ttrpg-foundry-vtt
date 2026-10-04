import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyChosenQualityEffects, bridgeWeaponQualities, selectableQualityIds, toggleQualityChoice, updateAttackSpecials } from '../rules/attack-specials.ts';
import type { DynamicModifierItemLike } from '../rules/dynamic-modifiers.ts';
import { applyModeQualities, type WeaponFiringMode } from '../rules/weapon-modes.ts';
import { collectWeaponQualityDieOps } from '../rules/weapon-quality-effects.ts';
import { chosenQualityEffects, setWeaponQualityPayloadsForTesting } from '../rules/weapon-quality-payloads.ts';
import { hookScale, makeDynamicHook } from '../testing/dynamic-modifier-hook.ts';
import { installFindSplice, uninstallFindSplice } from '../testing/find-splice.ts';
import { type AttackDataLike, Hit } from './damage-data.ts';
import type { ModifierSourcesShape } from './passive-modifiers.ts';
import { PsychicRollData, RollData, WeaponRollData } from './roll-data.ts';

// The ammo and weapon-mod to-hit calculators walk a fully-populated weapon and
// are not under test; the attack-special / weapon-quality calculator IS, so it
// stays real.
vi.mock('../rules/ammo.ts', async (orig) => ({ ...(await orig<object>()), calculateAmmoAttackBonuses: vi.fn() }));
vi.mock('../rules/weapon-modifiers.ts', async (orig) => ({ ...(await orig<object>()), calculateWeaponModifiersAttackBonuses: vi.fn() }));

/**
 * End-to-end propagation of equipment / talent / weapon-quality effects onto a
 * committed roll, through the three sanctioned paths:
 *
 * - Path A — an item's static `modifiers.combat.*`, recorded by `creature.ts` in
 *   `system.modifierSources.combat` and added by the roll / hit.
 * - Path B — roll-time collectors: weapon qualities (`weapon-quality-effects`),
 *   the qualities' data-driven die operations, and dynamic `scale` hooks.
 * - The ±60 aggregate cap and the per-component provenance on the committed roll.
 *
 * Each case runs under two game lines: the plumbing is system-generic, and a
 * DH2-only assumption would surface as a failure on the other line.
 */

const SYSTEMS = ['dh2', 'rt'] as const;

/* -------------------------------------------------------------------------- */
/*  Deterministic dice                                                         */
/* -------------------------------------------------------------------------- */

interface DieResult {
    result: number;
    active: boolean;
    discarded: boolean;
}

/** Scripted d10 results, consumed in order by every die the stub rolls. */
const dieQueue: number[] = [];

/** Stand-in for `foundry.dice.terms.Die`: rolls from {@link dieQueue} and honours `khN`. */
class StubDie {
    modifiers: string[] = [];
    results: DieResult[] = [];
    constructor(public number: number) {}

    roll(): number {
        const rolled = Array.from({ length: this.number }, () => dieQueue.shift() ?? 1);
        const keepModifier = this.modifiers.find((modifier) => modifier.startsWith('kh'));
        const keep = keepModifier === undefined ? rolled.length : Number(keepModifier.slice(2));
        const kept = new Set(
            rolled
                .map((value, index) => ({ value, index }))
                .sort((a, b) => b.value - a.value)
                .slice(0, keep)
                .map((entry) => entry.index),
        );
        this.results = rolled.map((result, index) => ({ result, active: kept.has(index), discarded: !kept.has(index) }));
        return this.results.filter((r) => r.active).reduce((sum, r) => sum + r.result, 0);
    }
}

/** Stand-in for Foundry's `Roll`: `NdX` dice terms and signed integers, nothing else. */
class StubRoll {
    readonly terms: Array<StubDie | number> = [];
    readonly #signs: number[] = [];
    total: number | null = null;

    constructor(formula: string) {
        for (const match of formula.replace(/\s+/g, '').matchAll(/([+-]?)([^+-]+)/g)) {
            const [, sign = '', body = ''] = match;
            const dice = /^(\d*)d\d+$/.exec(body);
            this.terms.push(dice === null ? Number(body) : new StubDie(Number(dice[1] === '' ? 1 : dice[1])));
            this.#signs.push(sign === '-' ? -1 : 1);
        }
    }

    async evaluate(): Promise<this> {
        this.total = this.terms.reduce<number>((sum, term, index) => sum + (this.#signs[index] ?? 1) * (term instanceof StubDie ? term.roll() : term), 0);
        return Promise.resolve(this);
    }
}

/* -------------------------------------------------------------------------- */
/*  Actor / weapon stand-ins                                                   */
/* -------------------------------------------------------------------------- */

/** A Path A provenance entry, as `creature.ts _applyItemModifiers` records it. */
function passive(name: string, value: number): { name: string; type: string; value: number } {
    return { name, type: 'talent', value };
}

type HitActor = AttackDataLike['rollData']['sourceActor'];
/** The hit pipeline's action item, plus the embedded items the quality checks walk. */
type HitWeapon = NonNullable<AttackDataLike['rollData']['weapon']> & { name: string; items: object[] };

/** The acting actor's read-surface for both the to-hit and the damage paths. */
function actor(gameSystem: string, modifierSources: ModifierSourcesShape = {}, items: DynamicModifierItemLike[] = []): HitActor {
    return {
        items,
        system: { gameSystem, modifierSources },
        getCharacteristicFuzzy: (key: string) => ({ bonus: key === 'Strength' ? 4 : 3, effectiveBonus: key === 'Strength' ? 4 : 3 }),
        hasTalent: () => false,
        hasTalentFuzzyWords: () => false,
    };
}

/** A weapon carrying its qualities the way compendium weapons do: identifiers in `effectiveSpecial`, no embedded items. */
function weapon(opts: { qualities?: string[]; ranged?: boolean; damage?: string; penetration?: number; items?: object[] } = {}): HitWeapon {
    const ranged = opts.ranged ?? true;
    return {
        name: 'Test Weapon',
        system: {
            effectiveSpecial: new Set(opts.qualities ?? []),
            effectiveDamageFormula: opts.damage ?? '1d10',
            effectivePenetration: opts.penetration ?? 0,
        },
        items: opts.items ?? [],
        isRanged: ranged,
        isMelee: !ranged,
    };
}

/** A weapon roll with only the fields the to-hit assembly reads (bypasses the config-heavy constructor). */
function weaponRoll(sourceActor: HitActor, weaponItem: HitWeapon, action = 'Standard Attack', modifiers: Record<string, number> = {}): WeaponRollData {
    // eslint-disable-next-line no-restricted-syntax -- test: bypass the WH40K-config constructor to exercise the assembly / commit methods
    const rd = Object.create(WeaponRollData.prototype) as WeaponRollData;
    Object.assign(rd, {
        sourceActor,
        targetActor: null,
        weapon: weaponItem,
        action,
        modifiers: { difficulty: 0, modifier: 0, aim: 0, ...modifiers },
        specialModifiers: {},
        weaponModifiers: {},
        dynamicAttackModifiers: {},
        expandedBuckets: {},
        modifierSources: [],
        attackSpecials: [],
        selectedQualities: [],
        chosenQualities: [],
        rangeBracket: '',
        rangeBonus: 0,
        rangeName: '',
    });
    return rd;
}

/** Quality mechanics as the weaponQuality compendium docs author them. */
function seedQualityMechanics(): void {
    setWeaponQualityPayloadsForTesting({
        'accurate': { type: 'attack', aimBonus: 10 },
        'twin-linked': { type: 'attack', attackBonus: 20, bonusHitOnTwoDoS: true },
        'tearing': { type: 'damage', dieOps: [{ op: 'keepHighest', phase: 'preEvaluate', extraDice: 1, modifierKey: 'tearing' }] },
        'proven-x': { type: 'damage', dieOps: [{ op: 'floor', phase: 'postEvaluate', usesLevel: true, modifierKey: 'proven' }] },
        'primitive-x': { type: 'damage', dieOps: [{ op: 'cap', phase: 'postEvaluate', usesLevel: true, modifierKey: 'primitive' }] },
        // The per-attack firing option: content marks it selectable, nothing in src/ names it.
        'maximal': { type: 'damage', selectable: true, maximalDamageDice: '1d10', maximalPenetrationBonus: 2, triggersRecharge: true },
    });
}

beforeEach(() => {
    dieQueue.length = 0;
    seedQualityMechanics();
    vi.stubGlobal('Roll', StubRoll);
    vi.stubGlobal('foundry', { dice: { terms: { Die: StubDie } } });
    vi.stubGlobal('game', { i18n: { localize: (key: string) => key }, wh40k: { log: () => undefined } });
});

afterEach(() => {
    vi.unstubAllGlobals();
    setWeaponQualityPayloadsForTesting({});
});

/* -------------------------------------------------------------------------- */
/*  To-hit                                                                     */
/* -------------------------------------------------------------------------- */

describe.each(SYSTEMS)('to-hit propagation onto the committed roll (%s)', (gameSystem) => {
    it('Path A: a talent / gear combat.attack modifier lands on the committed target with its own provenance row', async () => {
        const sources: ModifierSourcesShape = { combat: { attack: [passive('Battle Drill', 10), passive('Red-Dot Sight', 5)] } };
        const rd = weaponRoll(actor(gameSystem, sources), weapon(), 'Standard Attack', { difficulty: 10 });
        rd.baseTarget = 40;
        await rd.finalize();

        expect(rd.modifiers['Battle Drill']).toBe(10);
        expect(rd.modifiers['Red-Dot Sight']).toBe(5);
        expect(rd.modifierTotal).toBe(25);
        expect(rd.modifiedTarget).toBe(65);
        // Not lumped: each source is its own component on the card.
        expect(rd.modifierSources.map((c) => [c.key, c.value])).toEqual([
            ['difficulty', 10],
            ['Battle Drill', 10],
            ['Red-Dot Sight', 5],
        ]);
    });

    it('Path A: the same to-hit modifier also reaches a psychic attack', async () => {
        // eslint-disable-next-line no-restricted-syntax -- test: bypass the WH40K-config constructor to exercise finalize()
        const rd = Object.create(PsychicRollData.prototype) as PsychicRollData;
        Object.assign(rd, {
            sourceActor: actor(gameSystem, { combat: { attack: [passive('Battle Drill', 10)] } }),
            targetActor: null,
            power: { name: 'Smite', system: {}, items: [], isRanged: true, isMelee: false },
            action: '',
            modifiers: { difficulty: 0, modifier: 0 },
            specialModifiers: {},
            dynamicAttackModifiers: {},
            expandedBuckets: {},
            modifierSources: [],
            attackSpecials: [],
            rangeBracket: '',
        });
        await rd.finalize();

        expect(rd.modifierTotal).toBe(10);
        expect(rd.modifierSources).toEqual([expect.objectContaining({ key: 'Battle Drill', value: 10 })]);
    });

    // Regression: Twin-Linked lived twice — a hardcoded +20 on embedded attack-special
    // items in every mode, and a quality-set copy limited to single shots. A pack
    // weapon (quality only in `effectiveSpecial`) lost the bonus on any burst.
    it.each(['Standard Attack', 'Semi-Auto Burst', 'Full Auto Burst'])('Twin-Linked gives its +20 when fired as %s', (action) => {
        const rd = weaponRoll(actor(gameSystem), weapon({ qualities: ['twin-linked'] }), action);
        expect(rd.assembleFinalModifiers()['Twin-Linked']).toBe(20);
    });

    it('Accurate adds its aim bonus only while aiming', () => {
        const aiming = weaponRoll(actor(gameSystem), weapon({ qualities: ['accurate'] }), 'Standard Attack', { aim: 10 });
        expect(aiming.assembleFinalModifiers()['Accurate']).toBe(10);

        const notAiming = weaponRoll(actor(gameSystem), weapon({ qualities: ['accurate'] }));
        expect(notAiming.assembleFinalModifiers()).not.toHaveProperty('Accurate');
    });

    it('a quality carried both in the set and as a legacy embedded item counts once', () => {
        const embedded = { name: 'Accurate', isAttackSpecial: true, system: { state: { equipped: true } } };
        const rd = weaponRoll(actor(gameSystem), weapon({ qualities: ['accurate'], items: [embedded] }), 'Standard Attack', { aim: 10 });
        const assembled = rd.assembleFinalModifiers();
        const accurateTotal = Object.entries(assembled)
            .filter(([key]) => key.toLowerCase() === 'accurate')
            .reduce((sum, [, value]) => sum + value, 0);
        expect(accurateTotal).toBe(10);
    });

    it('the ±60 cap clamps the committed total, records the raw sum, and keeps every component', async () => {
        const sources: ModifierSourcesShape = { combat: { attack: [passive('Battle Drill', 30)] } };
        const rd = weaponRoll(actor(gameSystem, sources), weapon({ qualities: ['twin-linked'] }), 'Standard Attack', { difficulty: 20, aim: 10 });
        rd.baseTarget = 30;
        await rd.finalize();

        // 20 difficulty + 10 aim + 30 talent + 20 Twin-Linked = 80 raw.
        expect(rd.rawModifierTotal).toBe(80);
        expect(rd.modifierTotal).toBe(60);
        expect(rd.modifierCapFired).toBe(true);
        expect(rd.modifiedTarget).toBe(90);
        expect(rd.modifierSources.reduce((sum, c) => sum + c.value, 0)).toBe(80);
        expect(rd.modifierSources.map((c) => c.key)).toEqual(expect.arrayContaining(['difficulty', 'aim', 'Battle Drill', 'Twin-Linked']));
    });

    it('the negative cap fires symmetrically', async () => {
        const rd = weaponRoll(actor(gameSystem), weapon(), 'Standard Attack', { difficulty: -60, modifier: -15 });
        rd.baseTarget = 50;
        await rd.finalize();

        expect(rd.rawModifierTotal).toBe(-75);
        expect(rd.modifierTotal).toBe(-60);
        expect(rd.modifierCapFired).toBe(true);
    });

    it('the displayed aggregate target equals the committed target (one SSOT)', async () => {
        const sources: ModifierSourcesShape = { combat: { attack: [passive('Battle Drill', 10)] } };
        const rd = weaponRoll(actor(gameSystem, sources), weapon({ qualities: ['twin-linked'] }), 'Standard Attack', { difficulty: 10 });
        rd.baseTarget = 35;
        const displayed = rd.baseTarget + Object.values(rd.assembleFinalModifiers()).reduce((a, b) => a + b, 0);
        await rd.finalize();
        expect(rd.modifiedTarget).toBe(displayed);
    });
});

/* -------------------------------------------------------------------------- */
/*  Damage / penetration                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The roll's attack specials as `updateAttackSpecials` leaves them: any legacy
 * embedded specials first, then the weapon's own quality set bridged in (a
 * selectable quality only when `chosen`). Levels are numeric on the hit's surface.
 */
function rollSpecials(weaponItem: HitWeapon, embedded: readonly string[] = [], chosen: readonly string[] = []): { name: string; level?: number }[] {
    const specials: Parameters<typeof bridgeWeaponQualities>[0] = embedded.map((name) => ({ name }));
    bridgeWeaponQualities(specials, weaponItem.system.effectiveSpecial, new Set(chosen));
    return specials.map((s) => (typeof s.level === 'number' ? { name: s.name, level: s.level } : { name: s.name }));
}

/** An attack against a hit, with only what `Hit.createHit` reads. */
function attack(
    sourceActor: HitActor,
    weaponItem: HitWeapon,
    opts: { dos?: number; specials?: string[]; chosen?: string[]; action?: string } = {},
): AttackDataLike {
    const specials = rollSpecials(weaponItem, opts.specials, opts.chosen);
    return {
        rollData: {
            weapon: weaponItem,
            sourceActor,
            targetActor: null,
            roll: { total: 15 },
            isCalledShot: true,
            calledShotLocation: 'Body',
            action: opts.action ?? 'Standard Attack',
            rangeName: '',
            rangeBracket: '',
            modifiers: {},
            attackSpecials: specials,
            dos: opts.dos ?? 1,
            eyeOfVengeance: false,
            hasAttackSpecial: (name: string) => specials.some((s) => s.name === name),
            getAttackSpecial: (name: string) => ({ level: specials.find((s) => s.name === name)?.level ?? 0 }),
        },
    };
}

describe('collectWeaponQualityDieOps — die operations come from the bridged attack specials', () => {
    it('resolves Tearing / Proven (X) / Primitive (X) from a pack weapon’s quality ids, with the (X) level', () => {
        const ops = collectWeaponQualityDieOps(rollSpecials(weapon({ qualities: ['tearing', 'proven-3', 'primitive-7', 'reliable'] })));
        expect(ops.map((op) => [op.op, op.extraDice, op.threshold, op.modifierKey])).toEqual([
            ['keepHighest', 1, 0, 'tearing'],
            ['floor', 0, 3, 'proven'],
            ['cap', 0, 7, 'primitive'],
        ]);
    });

    it('collects a quality present both as an embedded attack special and in the set only once', () => {
        expect(collectWeaponQualityDieOps(rollSpecials(weapon({ qualities: ['tearing'] }), ['Tearing']))).toHaveLength(1);
    });
});

describe.each(SYSTEMS)('damage / penetration propagation onto a hit (%s)', (gameSystem) => {
    // Regression: die operations are collected from `rollData.attackSpecials`, which
    // compendium weapons never populated until their `effectiveSpecial` ids were
    // bridged in, so Tearing / Proven / Primitive never touched their damage.
    it('Tearing rolls an extra die and keeps the highest', async () => {
        dieQueue.push(2, 7);
        const hit = await Hit.createHit(attack(actor(gameSystem), weapon({ ranged: false, qualities: ['tearing'] })), 1);
        // 7 (kept) + Strength Bonus 4 for a melee weapon.
        expect(hit.damage).toBe(7);
        expect(hit.totalDamage).toBe(11);
    });

    it('Proven (3) raises a low damage die to 3, as a sourced modifier', async () => {
        dieQueue.push(1);
        const hit = await Hit.createHit(attack(actor(gameSystem), weapon({ qualities: ['proven-3'], damage: '1d10+2' })), 1);
        expect(hit.damage).toBe(3);
        expect(hit.modifiers['proven']).toBe(2);
        expect(hit.totalDamage).toBe(5);
    });

    it('Primitive (7) caps a high damage die at 7', async () => {
        dieQueue.push(9);
        const hit = await Hit.createHit(attack(actor(gameSystem), weapon({ qualities: ['primitive-7'] })), 1);
        expect(hit.modifiers['primitive']).toBe(-2);
        expect(hit.totalDamage).toBe(7);
    });

    it('Razor Sharp doubles penetration at 2+ DoS and not below', async () => {
        const sharp = weapon({ ranged: false, qualities: ['razor-sharp'], penetration: 3 });
        expect((await Hit.createHit(attack(actor(gameSystem), sharp, { dos: 2 }), 1)).totalPenetration).toBe(6);
        expect((await Hit.createHit(attack(actor(gameSystem), sharp, { dos: 1 }), 1)).totalPenetration).toBe(3);
    });

    // Regression: a legacy embedded Lance item ALSO fired an inline `pen × DoS`
    // branch whose 'lance' key then suppressed the collector — Pen × (DoS + 1).
    it('Lance multiplies penetration by DoS exactly once, even with a legacy embedded Lance item', async () => {
        const lanceItem = { name: 'Lance', isAttackSpecial: true, system: { state: { equipped: true } } };
        const lance = weapon({ ranged: false, qualities: ['lance'], penetration: 5, items: [lanceItem] });
        const hit = await Hit.createHit(attack(actor(gameSystem), lance, { dos: 3, specials: ['Lance'] }), 1);
        expect(hit.totalPenetration).toBe(15);
    });

    it('Path A: talent combat.damage / combat.penetration land on the hit, each named by its source', async () => {
        dieQueue.push(5);
        const sources: ModifierSourcesShape = { combat: { damage: [passive('Mighty Grip', 2)], penetration: [passive('Armour-Piercing Drill', 1)] } };
        const hit = await Hit.createHit(attack(actor(gameSystem, sources), weapon({ penetration: 2 })), 1);

        expect(hit.modifiers['mighty grip']).toBe(2);
        expect(hit.totalDamage).toBe(7);
        expect(hit.penetrationModifiers['armour-piercing drill']).toBe(1);
        expect(hit.totalPenetration).toBe(3);
    });

    it('a dynamic hook scaled by the strength bonus is evaluated against the live actor (Crushing Blow shape)', async () => {
        dieQueue.push(5);
        const crushing = {
            name: 'Crushing Blow',
            system: {
                modifiers: { dynamicModifiers: [makeDynamicHook({ condition: 'melee', scale: hookScale({ source: 'ws', factor: 0.5, round: 'up' }) })] },
            },
        };
        const hit = await Hit.createHit(attack(actor(gameSystem, {}, [crushing]), weapon({ ranged: false })), 1);
        // WSB 3 → ceil(1.5) = 2 on top of 5 + SB 4.
        expect(hit.modifiers['crushing blow']).toBe(2);
        expect(hit.totalDamage).toBe(11);
    });

    // Regression: `createHit` ran the dynamic pass BEFORE `_calculatePenetration`, so a
    // penetration hook scaled off (or multiplying) the weapon's penetration read 0.
    it('a penetration hook scaled by the weapon’s penetration reads the resolved value', async () => {
        const piercing = {
            name: 'Piercing Rounds',
            system: {
                modifiers: {
                    dynamicModifiers: [makeDynamicHook({ target: 'penetration', scale: hookScale({ source: 'penetration', factor: 1, round: 'none' }) })],
                },
            },
        };
        const hit = await Hit.createHit(attack(actor(gameSystem, {}, [piercing]), weapon({ penetration: 4 })), 1);
        expect(hit.penetrationModifiers['piercing rounds']).toBe(4);
        expect(hit.totalPenetration).toBe(8);
    });

    it('a multiply-mode penetration hook doubles the resolved penetration (Melta pen×2 shape)', async () => {
        const melta = {
            name: 'Melta Charge',
            system: { modifiers: { dynamicModifiers: [makeDynamicHook({ target: 'penetration', mode: 'multiply', value: 2 })] } },
        };
        const hit = await Hit.createHit(attack(actor(gameSystem, {}, [melta]), weapon({ penetration: 6 })), 1);
        expect(hit.totalPenetration).toBe(12);
    });
});

/* -------------------------------------------------------------------------- */
/*  The weapon's quality set → the roll's attack specials                      */
/* -------------------------------------------------------------------------- */

/** A firing-mode profile with only the quality changes set. */
function firingMode(addedQualities: string[], removedQualities: string[]): WeaponFiringMode {
    return {
        label: 'Mode',
        damage: '',
        damageType: '',
        damageBonus: null,
        penetration: null,
        range: null,
        addedQualities,
        removedQualities,
        weaponClass: '',
        attackType: '',
        characteristic: '',
        rateOfFire: null,
        singleUse: false,
        clipMax: 0,
        reload: '',
    };
}

describe.each(SYSTEMS)('a pack weapon’s quality ids reach the roll’s attack specials (%s)', (gameSystem) => {
    // The las-mode and weapon-mod passes prune with Foundry's `Array#findSplice`.
    let installedFindSplice = false;
    beforeAll(() => {
        installedFindSplice = installFindSplice();
    });
    afterAll(() => {
        uninstallFindSplice(installedFindSplice);
    });

    /** A weapon roll whose attack specials are prepared exactly as `WeaponRollData.update()` prepares them. */
    function prepared(weaponItem: HitWeapon, opts: { selected?: string[]; lasMode?: string; rangeName?: string } = {}): WeaponRollData {
        const rd = weaponRoll(actor(gameSystem), weaponItem);
        rd.selectedQualities = opts.selected ?? [];
        if (opts.lasMode !== undefined) rd.lasMode = opts.lasMode;
        if (opts.rangeName !== undefined) rd.rangeName = opts.rangeName;
        updateAttackSpecials(rd);
        return rd;
    }

    it('Twin-Linked, Storm, Reliable, Accurate and Vengeful (9) are on the roll from their ids alone', () => {
        const rd = prepared(weapon({ qualities: ['twin-linked', 'storm', 'reliable', 'accurate', 'vengeful-9'] }));
        for (const name of ['Twin-Linked', 'Storm', 'Reliable', 'Accurate', 'Vengeful']) {
            expect(rd.hasAttackSpecial(name)).toBe(true);
        }
        expect(rd.getAttackSpecial('Vengeful')).toEqual({ name: 'Vengeful', level: 9 });
    });

    it('a bridged Scatter earns its to-hit bonus at point blank through the central assembler', () => {
        const rd = prepared(weapon({ qualities: ['scatter'] }), { rangeName: 'Point Blank' });
        expect(rd.assembleFinalModifiers()['Scatter']).toBe(10);
    });

    it('the Overload las setting strips a bridged Reliable and makes the shot Unreliable', () => {
        const rd = prepared(weapon({ qualities: ['reliable'] }), { lasMode: 'Overload' });
        expect(rd.hasAttackSpecial('Reliable')).toBe(false);
        expect(rd.hasAttackSpecial('Unreliable')).toBe(true);
    });

    it('Accurate adds its extra damage die on 3+ DoS for a pack weapon', async () => {
        dieQueue.push(5, 4);
        const hit = await Hit.createHit(attack(actor(gameSystem), weapon({ qualities: ['accurate'] }), { dos: 3 }), 1);
        expect(hit.modifiers['accurate']).toBe(4);
    });

    it('Vengeful (9) turns a damage 9 into Righteous Fury; without it a 9 does not', async () => {
        // A Righteous Fury looks up the critical-damage table pack; none is loaded here.
        vi.stubGlobal('game', { i18n: { localize: (key: string) => key }, wh40k: { log: () => undefined }, packs: { get: () => undefined } });
        dieQueue.push(9, 3);
        expect((await Hit.createHit(attack(actor(gameSystem), weapon({ qualities: ['vengeful-9'] })), 1)).righteousFury).toHaveLength(1);
        dieQueue.push(9);
        expect((await Hit.createHit(attack(actor(gameSystem), weapon()), 1)).righteousFury).toHaveLength(0);
    });

    it('a selectable quality (Maximal) stays off the roll unless the attacker opts in', async () => {
        const plasma = weapon({ qualities: ['maximal', 'overheats'], penetration: 6 });
        expect(selectableQualityIds(plasma.system.effectiveSpecial, gameSystem)).toEqual(['maximal']);

        const standard = prepared(plasma);
        expect(standard.hasAttackSpecial('Maximal')).toBe(false);
        expect(standard.hasAttackSpecial('Overheats')).toBe(true);
        expect(standard.chosenQualities).toEqual([]);

        dieQueue.push(5);
        const standardHit = await Hit.createHit(attack(actor(gameSystem), plasma), 1);
        expect(standardHit.modifiers).not.toHaveProperty('maximal');
        expect(standardHit.totalPenetration).toBe(6);
    });

    it('an opted-in selectable quality is on the roll and recorded as the attacker’s choice', async () => {
        const plasma = weapon({ qualities: ['maximal', 'overheats'], penetration: 6 });
        const maximal = prepared(plasma, { selected: toggleQualityChoice([], 'maximal') });
        expect(maximal.hasAttackSpecial('Maximal')).toBe(true);
        expect(maximal.chosenQualities).toEqual(['maximal']);

        dieQueue.push(5, 7);
        const maximalHit = await Hit.createHit(attack(actor(gameSystem), plasma, { chosen: ['maximal'] }), 1);
        expect(maximalHit.modifiers['maximal']).toBe(7);
        expect(maximalHit.penetrationModifiers['maximal']).toBe(2);
        expect(maximalHit.totalPenetration).toBe(8);
    });

    // Maximal's bonus once lived in damage-data.ts as a literal 1d10 / +2; the
    // quality's authored mechanics are now the only source of those numbers.
    it('reads the chosen quality’s damage dice and penetration from its mechanics, not literals', async () => {
        setWeaponQualityPayloadsForTesting({
            maximal: { type: 'damage', selectable: true, maximalDamageDice: '2d10', maximalPenetrationBonus: 4, triggersRecharge: true },
        });
        const plasma = weapon({ qualities: ['maximal'], penetration: 6 });
        dieQueue.push(5, 3, 4);
        const hit = await Hit.createHit(attack(actor(gameSystem), plasma, { chosen: ['maximal'] }), 1);
        expect(hit.modifiers['maximal']).toBe(7);
        expect(hit.penetrationModifiers['maximal']).toBe(4);
        expect(hit.totalPenetration).toBe(10);
    });

    it('opting into a quality the weapon does not carry changes nothing', () => {
        const rd = prepared(weapon({ qualities: ['overheats'] }), { selected: ['maximal'] });
        expect(rd.hasAttackSpecial('Maximal')).toBe(false);
        expect(rd.chosenQualities).toEqual([]);
    });

    it('toggling an opt-in twice clears it', () => {
        expect(toggleQualityChoice(toggleQualityChoice([], 'maximal'), 'maximal')).toEqual([]);
    });

    it('a quality both embedded and in the id set is one attack special, counted once', () => {
        const embedded = { name: 'Twin-Linked', isAttackSpecial: true, system: { state: { equipped: true } } };
        const rd = prepared(weapon({ qualities: ['twin-linked'], items: [embedded] }));
        expect(rd.attackSpecials.filter((s) => s.name === 'Twin-Linked')).toHaveLength(1);
        expect(rd.assembleFinalModifiers()['Twin-Linked']).toBe(20);
    });

    it('the active firing mode’s added and removed qualities are respected', () => {
        const qualities = applyModeQualities(new Set(['overheats', 'reliable']), firingMode(['scatter'], ['overheats']));
        const rd = prepared(weapon({ qualities: [...qualities] }));
        expect(rd.hasAttackSpecial('Scatter')).toBe(true);
        expect(rd.hasAttackSpecial('Reliable')).toBe(true);
        expect(rd.hasAttackSpecial('Overheats')).toBe(false);
    });

    // Regression: the die-op merge re-read `effectiveSpecial`, resurrecting a quality a
    // weapon modification had removed from the roll (Mono strips Primitive).
    it('a quality a weapon mod removed contributes no die operation', () => {
        const mono = { name: 'Mono', isWeaponModification: true, system: { state: { equipped: true } } };
        const rd = prepared(weapon({ ranged: false, qualities: ['primitive-7'], items: [mono] }));
        expect(rd.hasAttackSpecial('Primitive')).toBe(false);
        expect(collectWeaponQualityDieOps(rd.attackSpecials)).toEqual([]);
    });
});

describe('RollData.passiveAttackModifiers', () => {
    it('sums two sources sharing a name and drops zero-valued entries', () => {
        // eslint-disable-next-line no-restricted-syntax -- test: bypass the WH40K-config constructor to exercise one method
        const rd = Object.create(RollData.prototype) as RollData;
        Object.assign(rd, { sourceActor: actor('dh2', { combat: { attack: [passive('Drill', 5), passive('Drill', 5), passive('Inert', 0)] } }) });
        expect(rd.passiveAttackModifiers()).toEqual({ Drill: 10 });
    });
});

// Maximal's range (+10 m), ammo (×3), Blast (+2) and Deathwatch's added Overheats
// were literals or missing; each line now authors them on the quality.
describe('while-chosen effects of a selectable quality (authored per line)', () => {
    beforeEach(() => {
        setWeaponQualityPayloadsForTesting({
            maximal: {
                type: 'damage',
                selectable: true,
                chosenRangeBonus: 10,
                chosenAmmoMultiplier: 3,
                chosenBlastBonus: 2,
                chosenAddedQualities: ['overheats'],
            },
        });
    });

    it('folds range, ammo, Blast and added qualities from the chosen quality’s mechanics', () => {
        expect(chosenQualityEffects(['maximal'])).toEqual({ rangeBonus: 10, ammoMultiplier: 3, blastBonus: 2, addedQualities: ['overheats'] });
    });

    it('changes nothing when no quality is chosen', () => {
        expect(chosenQualityEffects([])).toEqual({ rangeBonus: 0, ammoMultiplier: 1, blastBonus: 0, addedQualities: [] });
    });

    it('raises an existing Blast rating and adds the qualities the choice brings', () => {
        const specials = [{ name: 'Blast', level: 3 }];
        applyChosenQualityEffects(specials, ['maximal']);
        expect(specials).toEqual([
            { name: 'Blast', level: 5 },
            { name: 'Overheats', level: true },
        ]);
    });

    it('adds no Blast to a weapon that has none', () => {
        const specials: Array<{ name: string; level?: number | boolean }> = [];
        applyChosenQualityEffects(specials, ['maximal']);
        expect(specials.map((s) => s.name)).toEqual(['Overheats']);
    });
});
