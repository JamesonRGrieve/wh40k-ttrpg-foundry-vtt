import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
    DAMAGE_SOURCE,
    DAMAGE_TYPE,
    RIDER_AFFECTS as GATE_RIDER_AFFECTS,
    RIDER_AREA_MEASURE,
    RIDER_DURATION_KIND,
    RIDER_TEST_CHARACTERISTIC,
    unlicensedArtPaths,
    validateDoc,
    variant,
    WEAPON_CLASS,
} from '../scripts/validate-pack-schema.mjs';
import { WEAPON_CLASS_CHOICES } from '../src/module/data/shared/weapon-class.ts';
import { DAMAGE_SOURCE_CHOICES, DAMAGE_TYPE_CHOICES } from '../src/module/rules/damage-profile.ts';
import { RIDER_AFFECTS, RIDER_AREA_MEASURES, RIDER_DURATION_KINDS, RIDER_TEST_CHARACTERISTICS } from '../src/module/rules/grenade-rider.ts';

/**
 * Unit coverage for the Zod v4 compendium content-schema gate
 * (`scripts/validate-pack-schema.mjs`). The gate is green on the whole `_source`
 * corpus and must catch the corruption class that bit us in play — a ranged weapon
 * stored as `class: "melee"`, a bad enum, a bad `crewExposure` — while accepting the
 * homologated variant-container authoring format and the neutral blank crewExposure.
 */

describe('validateDoc', () => {
    it('passes a well-formed ranged weapon', () => {
        const doc = {
            name: 'Autocannon',
            type: 'weapon',
            system: { class: 'heavy', type: 'solid-projectile', melee: false, attack: { type: 'ranged', characteristic: 'ballisticSkill' } },
        };
        expect(validateDoc(doc)).toEqual([]);
    });

    it('CATCHES a ranged weapon mis-typed as melee (the Dreadnought corruption)', () => {
        const doc = {
            name: 'Autocannon',
            type: 'weapon',
            system: { class: 'heavy', type: 'solid-projectile', melee: true, attack: { type: 'melee', characteristic: 'weaponSkill' } },
        };
        const errs = validateDoc(doc);
        expect(errs.length).toBeGreaterThan(0);
        expect(errs.join(' ')).toMatch(/incoherent weapon/);
    });

    it('catches an invalid class enum (typo)', () => {
        expect(validateDoc({ name: 'Sword', type: 'weapon', system: { class: 'meele' } }).length).toBeGreaterThan(0);
    });

    it('accepts a per-line variant container for class', () => {
        expect(validateDoc({ name: 'Grenade Launcher', type: 'weapon', system: { class: { dh2: 'basic', dw: 'basic' } } })).toEqual([]);
    });

    it('accepts the neutral blank crewExposure but rejects an invalid one', () => {
        expect(validateDoc({ name: 'Walker', type: 'vehicleTrait', system: { effects: { crewExposure: '' } } })).toEqual([]);
        expect(validateDoc({ name: 'Walker', type: 'vehicleTrait', system: { effects: { crewExposure: 'exposed' } } }).length).toBeGreaterThan(0);
    });

    it('skips whole-file reference stubs and non-Item/Actor documents', () => {
        expect(validateDoc({ reference: 'packs/x/_source/y.json' })).toEqual([]);
        expect(validateDoc({ name: 'Session 1', text: { content: '<p>…</p>' } })).toEqual([]);
    });
});

describe('variant', () => {
    it('accepts a scalar, a PARTIAL per-line container, and rejects non-line keys', () => {
        const schema = variant(z.enum(['a', 'b']));
        expect(schema.safeParse('a').success).toBe(true);
        expect(schema.safeParse({ dh2: 'a', dw: 'b' }).success).toBe(true); // subset of lines is fine
        expect(schema.safeParse({ notALine: 'a' }).success).toBe(false);
    });
});

describe('weapon class list', () => {
    // The gate once kept its own list and rejected `placed` (DW Melta Bomb) after the
    // DataModel accepted it. Every DataModel class must pass the gate.
    it('accepts every class the weapon DataModel accepts', () => {
        for (const cls of WEAPON_CLASS_CHOICES) expect(WEAPON_CLASS).toContain(cls);
    });
});

describe('contextual damage profiles (#608)', () => {
    const band = (maxRange: number | null, formula = '1d10'): object => ({ maxRange, formula, type: 'energy', penetration: 2, bonus: 9, qualities: [] });
    const weapon = (damage: object): object => ({ name: 'Beamer', type: 'weapon', system: { damage } });

    it('keeps the gate lists in step with the DataModel choices', () => {
        expect(DAMAGE_TYPE).toEqual([...DAMAGE_TYPE_CHOICES]);
        expect(DAMAGE_SOURCE).toEqual([...DAMAGE_SOURCE_CHOICES]);
    });

    it('accepts rising bands with an unbounded last band, per line too', () => {
        expect(validateDoc(weapon({ formula: '', bands: [band(15), band(50), band(null)] }))).toEqual([]);
        expect(validateDoc(weapon({ dh1: { formula: '', bands: [band(15), band(null)] } }))).toEqual([]);
    });

    it('rejects bands out of order, an unbounded band before the last, and a malformed band', () => {
        expect(validateDoc(weapon({ bands: [band(50), band(15)] })).length).toBeGreaterThan(0);
        expect(validateDoc(weapon({ bands: [band(null), band(50)] })).length).toBeGreaterThan(0);
        expect(validateDoc(weapon({ bands: [{ maxRange: 15, formula: '', type: 'energy', penetration: 0, bonus: 0, qualities: [] }] })).length).toBeGreaterThan(
            0,
        );
        expect(validateDoc(weapon({ bands: [{ ...band(15), type: 'plasma' }] })).length).toBeGreaterThan(0);
    });

    it('accepts a RollTable UUID or blank for `table`, and rejects anything else', () => {
        expect(validateDoc(weapon({ table: 'Compendium.wh40k-rpg.dh1-radical-rolltables.RollTable.15df0cf72c366222' }))).toEqual([]);
        expect(validateDoc(weapon({ table: '' }))).toEqual([]);
        expect(validateDoc(weapon({ table: 'Compendium.wh40k-rpg.dh1-radical-items-weapons.Item.1668f6aa4b3e9469' })).length).toBeGreaterThan(0);
    });

    it('accepts the borrowed sources and rejects an unknown one', () => {
        expect(validateDoc(weapon({ from: 'mount' }))).toEqual([]);
        expect(validateDoc(weapon({ from: 'wielder-melee' }))).toEqual([]);
        expect(validateDoc(weapon({ from: 'wielder' })).length).toBeGreaterThan(0);
    });

    it('accepts the IM string damage notation as authored', () => {
        expect(validateDoc(weapon({ im: '2 + StrB' }))).toEqual([]);
    });

    it('checks a RollTable result damage profile', () => {
        const table = (damageProfile: object): object => ({ name: 'Discharge', results: [{ range: [1, 10], flags: { 'wh40k-rpg': { damageProfile } } }] });
        expect(validateDoc(table({ formula: '3d10', bonus: 10, type: 'energy', penetration: 0 }))).toEqual([]);
        expect(validateDoc(table({ formula: '' })).length).toBeGreaterThan(0);
        expect(validateDoc(table({ formula: '3d10', type: 'warp' })).length).toBeGreaterThan(0);
        expect(validateDoc({ name: 'Plain', results: [{ range: [1, 10], text: 'x' }] })).toEqual([]);
    });
});

describe('grenade riders (#135)', () => {
    const rider = (overrides: object = {}): object => ({
        test: { characteristic: 'agility', modifier: 10, psykerModifier: 0 },
        affects: '',
        condition: 'blinded',
        area: { size: '', measure: 'radius' },
        duration: { kind: 'degreesOfFailure', base: 0, formula: '' },
        effectRollShift: { perDegree: 0, max: 0 },
        effect: 'Blinded for a number of rounds equal to the degrees of failure.',
        ...overrides,
    });
    const grenade = (value: object | null): object => ({ name: 'Photon Flash Grenade', type: 'weapon', system: { rider: value } });

    it('keeps the gate lists in step with the DataModel choices', () => {
        expect(RIDER_TEST_CHARACTERISTIC).toEqual(['', ...RIDER_TEST_CHARACTERISTICS]);
        expect(RIDER_DURATION_KIND).toEqual([...RIDER_DURATION_KINDS]);
        expect(RIDER_AREA_MEASURE).toEqual([...RIDER_AREA_MEASURES]);
        expect(GATE_RIDER_AFFECTS).toEqual([...RIDER_AFFECTS]);
    });

    it('accepts a whole rider, a per-line container of riders, a line that prints none, and no rider', () => {
        expect(validateDoc(grenade(rider()))).toEqual([]);
        expect(validateDoc(grenade({ dh2: rider(), rt: rider({ duration: { kind: 'roll', base: 0, formula: '1d5' } }) }))).toEqual([]);
        // Black Crusade prints no rider for the shared Rad Grenade (#622).
        expect(validateDoc(grenade({ dh2: rider(), bc: null }))).toEqual([]);
        expect(validateDoc(grenade(null))).toEqual([]);
        expect(validateDoc({ name: 'Frag Grenade', type: 'weapon', system: {} })).toEqual([]);
    });

    it('requires who the rider touches, a psyker modifier and a condition id (#623)', () => {
        expect(
            validateDoc(grenade(rider({ affects: 'psyker', condition: '', test: { characteristic: 'willpower', modifier: -30, psykerModifier: 0 } }))),
        ).toEqual([]);
        expect(validateDoc(grenade(rider({ affects: 'daemon' }))).length).toBeGreaterThan(0);
        expect(validateDoc(grenade(rider({ condition: 'Blinded' }))).length).toBeGreaterThan(0);
        expect(validateDoc(grenade(rider({ test: { characteristic: 'agility', modifier: 10 } }))).length).toBeGreaterThan(0);
        const noCondition = Object.fromEntries(Object.entries(rider()).filter(([key]) => key !== 'condition'));
        expect(validateDoc(grenade(noCondition)).length).toBeGreaterThan(0);
    });

    it('rejects an unknown characteristic, duration kind or measure, a blank effect and a stray key', () => {
        expect(validateDoc(grenade(rider({ test: { characteristic: 'influence', modifier: 0, psykerModifier: 0 } }))).length).toBeGreaterThan(0);
        expect(validateDoc(grenade(rider({ duration: { kind: 'scene', base: 0, formula: '' } }))).length).toBeGreaterThan(0);
        expect(validateDoc(grenade(rider({ area: { size: '6', measure: 'cone' } }))).length).toBeGreaterThan(0);
        expect(validateDoc(grenade(rider({ effect: '' }))).length).toBeGreaterThan(0);
        expect(validateDoc(grenade(rider({ accentClass: 'tw-text-white' }))).length).toBeGreaterThan(0);
    });

    it('requires a dice formula exactly for a rolled duration', () => {
        expect(validateDoc(grenade(rider({ duration: { kind: 'roll', base: 0, formula: '' } }))).length).toBeGreaterThan(0);
        expect(validateDoc(grenade(rider({ duration: { kind: 'encounter', base: 0, formula: '1d5' } }))).length).toBeGreaterThan(0);
    });
});

/**
 * The unlicensed-art gate (#625): the GameDevMarket icon packs are parked unserved
 * in `_vendored-ui/`, so a reference to them anywhere in a document is a broken
 * icon and an invalid-asset console error. The gate must name every such field
 * and leave a game-icons hotlink, core icon or curated art alone.
 */
describe('unlicensed art gate (#625)', () => {
    const VENDORED = 'systems/wh40k-rpg/packs/_vendored-ui/icons/items/grenade/grenade_07.png';
    const GAME_ICON = 'https://cdn.jsdelivr.net/gh/game-icons/icons@master/lorc/grenade.svg';

    it('flags a vendored img on the document itself', () => {
        const errs = validateDoc({ name: 'Frag Grenade', type: 'weapon', img: VENDORED, system: {} });
        expect(errs).toHaveLength(1);
        expect(errs[0]).toMatch(/^\/img: references unlicensed art/);
    });

    it('flags it on embedded items, token textures and effect icons, by path', () => {
        const actor = {
            name: 'Ganger',
            type: 'dh2-npc',
            img: 'https://static.wikia.nocookie.net/warhammer40k/images/x.png',
            prototypeToken: { texture: { src: VENDORED } },
            items: [
                { name: 'Knife', type: 'weapon', img: GAME_ICON },
                { name: 'Frag Grenade', type: 'weapon', img: VENDORED },
            ],
            effects: [{ name: 'Stunned', icon: VENDORED }],
        };
        expect(unlicensedArtPaths(actor)).toEqual(['/prototypeToken/texture/src', '/items/1/img', '/effects/0/icon']);
        expect(validateDoc(actor)).toHaveLength(3);
    });

    it('flags the old served location the packs were pulled from', () => {
        expect(validateDoc({ name: 'Dodge', type: 'talent', img: 'systems/wh40k-rpg/icons/talents/violet/p_10.png', system: {} })).toHaveLength(1);
        expect(validateDoc({ name: 'Smite', type: 'psychicPower', img: 'systems/wh40k-rpg/icons/psykana/fire-red-1.jpg', system: {} })).toHaveLength(1);
    });

    it('flags a vendored override on a reference stub', () => {
        expect(validateDoc({ reference: '../other/_source/x.json', img: VENDORED })).toHaveLength(1);
    });

    it('passes game-icons hotlinks, Foundry core icons and curated art', () => {
        expect(validateDoc({ name: 'Frag Grenade', type: 'weapon', img: GAME_ICON, system: {} })).toEqual([]);
        expect(validateDoc({ name: 'Prone', type: 'condition', img: 'icons/svg/falling.svg', system: {} })).toEqual([]);
        expect(validateDoc({ name: 'Webber', type: 'weapon', img: 'systems/wh40k-rpg/packs/images/items/dh2/webber.webp', system: {} })).toEqual([]);
        expect(unlicensedArtPaths('systems/wh40k-rpg/icons/whatever.svg')).toEqual([]);
    });
});
