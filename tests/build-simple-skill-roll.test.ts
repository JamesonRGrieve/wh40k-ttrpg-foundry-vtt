/**
 * Frozen-shape regression tests for `WH40KBaseActor._buildSimpleSkillRoll(...)`.
 *
 * The helper centralises the SimpleSkillData boilerplate that used to be hand-rolled in
 * `WH40KAcolyte.rollCharacteristic` / `rollSkill` and `WH40KNPC.rollCharacteristic` /
 * `rollSimpleWeapon` / `rollSkill`. These tests pin the produced rollData shape against
 * the literal field assignments those methods used to make so any drift surfaces in CI.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// --- Stub Foundry globals before importing system modules. -----------------
// `unified-roll-dialog.ts` (transitive import via base-actor.ts) reads
// `foundry.applications.api.ApplicationV2` at module top-level, and `roll-helpers.ts`
// references `foundry.applications.handlebars` lazily. We need the namespaces to exist.
const ORIGINAL_FOUNDRY = (globalThis as Record<string, unknown>).foundry;
const ORIGINAL_GAME = (globalThis as Record<string, unknown>).game;
const ORIGINAL_ACTOR = (globalThis as Record<string, unknown>).Actor;
const ORIGINAL_CONST = (globalThis as Record<string, unknown>).CONST;

class FakeApplicationV2 {}
const fakeHandlebarsApplicationMixin = <T extends new (...args: any[]) => object>(Base: T): T => class extends Base {} as T;
class FakeActor {
    declare system: unknown;
    declare items: unknown;
    declare characteristics: unknown;
    constructor(public _data: Record<string, unknown> = {}) {
        Object.assign(this, _data);
    }
}

(globalThis as Record<string, unknown>).foundry = {
    applications: {
        api: {
            ApplicationV2: FakeApplicationV2,
            HandlebarsApplicationMixin: fakeHandlebarsApplicationMixin,
        },
        handlebars: {
            renderTemplate: async () => '',
        },
    },
    utils: {
        Collection: class FakeCollection extends Map {},
    },
};
(globalThis as Record<string, unknown>).Actor = FakeActor;
(globalThis as Record<string, unknown>).CONST = {
    TOKEN_DISPLAY_MODES: { OWNER_HOVER: 0 },
    TOKEN_DISPOSITIONS: { NEUTRAL: 0, HOSTILE: -1 },
};
(globalThis as Record<string, unknown>).game = {
    i18n: {
        localize: (key: string) => key,
        format: (key: string) => key,
    },
    user: { id: 'test' },
    settings: { get: () => false },
    wh40k: { log: () => {}, error: () => {} },
};

// Imports must come AFTER the global stubs so module-init code finds the shims.
const { WH40KBaseActor } = await import('../src/module/documents/base-actor.ts');
const { SimpleSkillData } = await import('../src/module/rolls/action-data.ts');

afterAll(() => {
    (globalThis as Record<string, unknown>).foundry = ORIGINAL_FOUNDRY;
    (globalThis as Record<string, unknown>).game = ORIGINAL_GAME;
    (globalThis as Record<string, unknown>).Actor = ORIGINAL_ACTOR;
    (globalThis as Record<string, unknown>).CONST = ORIGINAL_CONST;
});

/* -------------------------------------------- */
/*  Test harness                                 */
/* -------------------------------------------- */

type SituationalEntry = { key: string; value: number };

interface RollFixture {
    actorName: string;
    nameOverride: string;
    type: 'Characteristic' | 'Skill' | 'Attack';
    rollKey: string;
    baseTarget: number;
    modifierBaseline: number;
    situational?: number;
}

/**
 * Construct a bare-bones helper consumer. We do not invoke `new WH40KBaseActor(...)`
 * because the Foundry Actor base class does heavy data preparation; instead we build a
 * plain object whose prototype is `WH40KBaseActor.prototype`, which is enough to exercise
 * `_buildSimpleSkillRoll` without booting the rest of the document machinery.
 */
function makeActor(opts: {
    name: string;
    situationalCharacteristics?: Record<string, SituationalEntry[]>;
    situationalSkills?: Record<string, SituationalEntry[]>;
    situationalCombat?: Record<string, SituationalEntry[]>;
}): InstanceType<typeof WH40KBaseActor> {
    const actor = Object.create(WH40KBaseActor.prototype) as InstanceType<typeof WH40KBaseActor> & {
        name: string;
        getCharacteristicSituationalModifiers?: (k: string) => SituationalEntry[];
        getSkillSituationalModifiers?: (k: string) => SituationalEntry[];
        getCombatSituationalModifiers?: (k: string) => SituationalEntry[];
    };
    actor.name = opts.name;
    if (opts.situationalCharacteristics) {
        actor.getCharacteristicSituationalModifiers = (k) => opts.situationalCharacteristics?.[k] ?? [];
    }
    if (opts.situationalSkills) {
        actor.getSkillSituationalModifiers = (k) => opts.situationalSkills?.[k] ?? [];
    }
    if (opts.situationalCombat) {
        actor.getCombatSituationalModifiers = (k) => opts.situationalCombat?.[k] ?? [];
    }
    return actor;
}

function assertShape(simpleSkillData: unknown, fixture: RollFixture, sourceActor: unknown): void {
    expect(simpleSkillData).toBeInstanceOf(SimpleSkillData);
    const rollData = (simpleSkillData as { rollData: Record<string, unknown> }).rollData;

    expect(rollData.actor, 'rollData.actor === source actor').toBe(sourceActor);
    expect(rollData.sourceActor, 'rollData.sourceActor === source actor').toBe(sourceActor);
    expect(rollData.nameOverride).toBe(fixture.nameOverride);
    expect(rollData.type).toBe(fixture.type);
    expect(rollData.rollKey).toBe(fixture.rollKey);
    expect(rollData.baseTarget).toBe(fixture.baseTarget);
    const modifiers = rollData.modifiers as { modifier: number; situational?: number };
    expect(modifiers.modifier).toBe(fixture.modifierBaseline);
    if (fixture.situational !== undefined) {
        expect(modifiers.situational).toBe(fixture.situational);
    } else {
        expect(modifiers.situational).toBeUndefined();
    }
}

// Helper to invoke the protected `_buildSimpleSkillRoll` method without TS protection
// errors at the call site — equivalent to calling it from a subclass.
function buildRoll(actor: unknown, opts: Parameters<InstanceType<typeof WH40KBaseActor>['_buildSimpleSkillRoll']>[0]): SimpleSkillData {
    return (actor as { _buildSimpleSkillRoll: (o: typeof opts) => SimpleSkillData })._buildSimpleSkillRoll(opts);
}

/* -------------------------------------------- */
/*  PC-path tests (situational modifiers wired)  */
/* -------------------------------------------- */

describe('_buildSimpleSkillRoll — PC (acolyte) paths honour situational modifiers', () => {
    it('rollCharacteristic: produces SimpleSkillData identical to the legacy hand-rolled shape', () => {
        const actor = makeActor({
            name: 'Acolyte Vex',
            situationalCharacteristics: {
                weaponSkill: [
                    { key: 'weaponSkill', value: 10 },
                    { key: 'weaponSkill', value: -5 },
                ],
            },
        });

        const result = buildRoll(actor, {
            key: 'weaponSkill',
            type: 'characteristic',
            label: 'Weapon Skill Test',
            target: 42,
            situationalKey: 'weaponSkill',
        });

        assertShape(
            result,
            {
                actorName: 'Acolyte Vex',
                nameOverride: 'Weapon Skill Test',
                type: 'Characteristic',
                rollKey: 'weaponSkill',
                baseTarget: 42,
                modifierBaseline: 0,
                situational: 5,
            },
            actor,
        );
    });

    it('rollCharacteristic with flavorOverride: nameOverride wins over the default label', () => {
        const actor = makeActor({
            name: 'Acolyte Vex',
            situationalCharacteristics: { ballisticSkill: [] },
        });

        const result = buildRoll(actor, {
            key: 'ballisticSkill',
            type: 'characteristic',
            label: 'Ballistic Skill Test',
            target: 35,
            situationalKey: 'ballisticSkill',
            nameOverride: 'Lasgun Snap-Shot',
        });

        assertShape(
            result,
            {
                actorName: 'Acolyte Vex',
                nameOverride: 'Lasgun Snap-Shot',
                type: 'Characteristic',
                rollKey: 'ballisticSkill',
                baseTarget: 35,
                modifierBaseline: 0,
            },
            actor,
        );
    });

    it('rollSkill: emits type="Skill" and pulls from skill situational modifiers', () => {
        const actor = makeActor({
            name: 'Acolyte Vex',
            situationalSkills: {
                dodge: [{ key: 'dodge', value: 20 }],
            },
        });

        const result = buildRoll(actor, {
            key: 'dodge',
            type: 'skill',
            label: 'Dodge Test',
            target: 50,
            situationalKey: 'dodge',
        });

        assertShape(
            result,
            {
                actorName: 'Acolyte Vex',
                nameOverride: 'Dodge Test',
                type: 'Skill',
                rollKey: 'dodge',
                baseTarget: 50,
                modifierBaseline: 0,
                situational: 20,
            },
            actor,
        );
    });

    it('rollSkill specialist: label can carry "Skill: Specialty" composition', () => {
        const actor = makeActor({
            name: 'Acolyte Vex',
            situationalSkills: { commonLore: [] },
        });

        const result = buildRoll(actor, {
            key: 'commonLore',
            type: 'skill',
            label: 'Common Lore: Imperium Test',
            target: 40,
            situationalKey: 'commonLore',
        });

        expect((result.rollData as { nameOverride: string }).nameOverride).toBe('Common Lore: Imperium Test');
    });

    it('zero situational total leaves modifiers.situational unset (does not write 0)', () => {
        const actor = makeActor({
            name: 'Acolyte Vex',
            situationalCharacteristics: {
                weaponSkill: [
                    { key: 'weaponSkill', value: 10 },
                    { key: 'weaponSkill', value: -10 },
                ],
            },
        });

        const result = buildRoll(actor, {
            key: 'weaponSkill',
            type: 'characteristic',
            label: 'Weapon Skill Test',
            target: 42,
            situationalKey: 'weaponSkill',
        });

        const modifiers = (result.rollData as { modifiers: { modifier: number; situational?: number } }).modifiers;
        expect(modifiers.situational).toBeUndefined();
    });
});

/* -------------------------------------------- */
/*  NPC-path tests (no situational lookup)       */
/* -------------------------------------------- */

describe('_buildSimpleSkillRoll — NPC paths skip situational lookup entirely', () => {
    it('rollCharacteristic on NPC (no situationalKey passed) does not consult situational modifiers', () => {
        // Even if the actor exposes the modifier collectors, omitting situationalKey should
        // skip them. This guarantees NPCs cannot accidentally inherit PC-only behaviour.
        const actor = makeActor({
            name: 'Cultist',
            situationalCharacteristics: {
                weaponSkill: [{ key: 'weaponSkill', value: 999 }], // booby-trap value
            },
        });

        const result = buildRoll(actor, {
            key: 'weaponSkill',
            type: 'characteristic',
            label: 'Weapon Skill Test',
            target: 35,
        });

        assertShape(
            result,
            {
                actorName: 'Cultist',
                nameOverride: 'Weapon Skill Test',
                type: 'Characteristic',
                rollKey: 'weaponSkill',
                baseTarget: 35,
                modifierBaseline: 0,
            },
            actor,
        );
    });

    it('rollCharacteristic with flavor: nameOverride wins', () => {
        const actor = makeActor({ name: 'Cultist' });
        const result = buildRoll(actor, {
            key: 'agility',
            type: 'characteristic',
            label: 'Agility Test',
            target: 30,
            nameOverride: 'Hasty Dodge',
        });
        expect((result.rollData as { nameOverride: string }).nameOverride).toBe('Hasty Dodge');
    });

    it('rollSimpleWeapon: type maps to literal "Attack" and rollKey is the attack characteristic', () => {
        const actor = makeActor({ name: 'Heavy Cultist' });
        const result = buildRoll(actor, {
            key: 'ballisticSkill',
            type: 'simpleWeapon',
            label: 'Autogun Attack',
            target: 35,
        });

        assertShape(
            result,
            {
                actorName: 'Heavy Cultist',
                nameOverride: 'Autogun Attack',
                type: 'Attack',
                rollKey: 'ballisticSkill',
                baseTarget: 35,
                modifierBaseline: 0,
            },
            actor,
        );
    });

    it('rollSkill on NPC: type="Skill", no situational lookup', () => {
        const actor = makeActor({
            name: 'Scholar Cultist',
            situationalSkills: { awareness: [{ key: 'awareness', value: 42 }] },
        });

        const result = buildRoll(actor, {
            key: 'awareness',
            type: 'skill',
            label: 'Awareness Test',
            target: 45,
        });

        assertShape(
            result,
            {
                actorName: 'Scholar Cultist',
                nameOverride: 'Awareness Test',
                type: 'Skill',
                rollKey: 'awareness',
                baseTarget: 45,
                modifierBaseline: 0,
            },
            actor,
        );
    });
});

/* -------------------------------------------- */
/*  Cross-cutting structural assertions          */
/* -------------------------------------------- */

describe('_buildSimpleSkillRoll — structural invariants', () => {
    it('always returns a fresh SimpleSkillData (no shared rollData between calls)', () => {
        const actor = makeActor({ name: 'A' });
        const a = buildRoll(actor, { key: 'k', type: 'characteristic', label: 'L', target: 1 });
        const b = buildRoll(actor, { key: 'k', type: 'characteristic', label: 'L', target: 1 });
        expect(a).not.toBe(b);
        expect(a.rollData).not.toBe(b.rollData);
    });

    it('PC path with situationalKey provided but no collector method present returns 0 situational', () => {
        // makeActor without any situational* maps doesn't define the collector methods.
        const actor = makeActor({ name: 'A' });
        const result = buildRoll(actor, {
            key: 'weaponSkill',
            type: 'characteristic',
            label: 'WS Test',
            target: 40,
            situationalKey: 'weaponSkill',
        });
        const modifiers = (result.rollData as { modifiers: { modifier: number; situational?: number } }).modifiers;
        expect(modifiers.modifier).toBe(0);
        expect(modifiers.situational).toBeUndefined();
    });
});
